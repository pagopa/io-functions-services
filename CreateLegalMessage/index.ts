import { Context } from "@azure/functions";

import * as cors from "cors";
import * as express from "express";

import {
  MESSAGE_COLLECTION_NAME,
  MessageModel
} from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "@pagopa/io-functions-commons/dist/src/models/service";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";

import { withAppInsightsContext } from "@pagopa/io-functions-commons/dist/src/utils/application_insights";
import { createBlobService } from "azure-storage";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { initTelemetryClient } from "../utils/appinsights";

import { getConfigOrThrow } from "../utils/config";
import { DummyLegalMessageMapModel } from "../utils/legal-message";
import { apiClient as adminClient } from "../clients/admin";
import { makeUpsertBlobFromObject } from "../CreateMessage/utils";
import { CreateLegalMessage } from "./handler";

const config = getConfigOrThrow();

// Setup Express
const app = express();
secureExpressApp(app);

// Set up CORS (free access to the API from browser clients)
app.use(cors());

const messageModel = new MessageModel(
  cosmosdbInstance.container(MESSAGE_COLLECTION_NAME),
  config.MESSAGE_CONTAINER_NAME
);

const serviceModel = new ServiceModel(
  cosmosdbInstance.container(SERVICE_COLLECTION_NAME)
);

const blobService = createBlobService(
  config.INTERNAL_STORAGE_CONNECTION_STRING
);

const telemetryClient = initTelemetryClient(
  config.APPINSIGHTS_INSTRUMENTATIONKEY
);

const legalMapperClient = DummyLegalMessageMapModel;

app.post(
  "/api/v1/legal-messages/:legalmail",
  CreateLegalMessage(
    adminClient,
    legalMapperClient,
    telemetryClient,
    serviceModel,
    messageModel,
    makeUpsertBlobFromObject(
      blobService,
      config.PROCESSING_MESSAGE_CONTAINER_NAME
    ),
    config.FF_DISABLE_INCOMPLETE_SERVICES,
    config.FF_INCOMPLETE_SERVICE_WHITELIST
  )
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
const httpStart = (context: Context): void => {
  setAppContext(app, context);
  withAppInsightsContext(context, () => azureFunctionHandler(context));
};

export default httpStart;
