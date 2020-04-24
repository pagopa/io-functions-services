import { Context } from "@azure/functions";

import * as cors from "cors";
import * as express from "express";

import {
  MESSAGE_COLLECTION_NAME,
  MessageModel
} from "io-functions-commons/dist/src/models/message";
import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "io-functions-commons/dist/src/models/service";
import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { secureExpressApp } from "io-functions-commons/dist/src/utils/express";
import { setAppContext } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { withAppInsightsContext } from "io-functions-commons/dist/src/utils/application_insights";
import { initTelemetryClient } from "../utils/appinsights";
import { documentClient } from "../utils/cosmosdb";
import { CreateMessage } from "./handler";

// Setup Express
const app = express();
secureExpressApp(app);

// Set up CORS (free access to the API from browser clients)
app.use(cors());

const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");
const messageContainerName = getRequiredStringEnv("MESSAGE_CONTAINER_NAME");

const documentDbDatabaseUrl = documentDbUtils.getDatabaseUri(cosmosDbName);
const messagesCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  MESSAGE_COLLECTION_NAME
);
const servicesCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  SERVICE_COLLECTION_NAME
);

const messageModel = new MessageModel(
  documentClient,
  messagesCollectionUrl,
  messageContainerName
);

const serviceModel = new ServiceModel(documentClient, servicesCollectionUrl);

const telemetryClient = initTelemetryClient(
  getRequiredStringEnv("APPINSIGHTS_INSTRUMENTATIONKEY")
);

app.post(
  "/api/v1/messages/:fiscalcode?",
  CreateMessage(telemetryClient, serviceModel, messageModel)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  setAppContext(app, context);
  withAppInsightsContext(context, () => azureFunctionHandler(context));
}

export default httpStart;
