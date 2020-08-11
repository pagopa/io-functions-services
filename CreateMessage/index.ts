import { Context } from "@azure/functions";
import { cosmosdbInstance } from "../utils/cosmosdb";

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
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { secureExpressApp } from "io-functions-commons/dist/src/utils/express";
import { setAppContext } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { withAppInsightsContext } from "io-functions-commons/dist/src/utils/application_insights";
import { initTelemetryClient } from "../utils/appinsights";
import { CreateMessage } from "./handler";

// Setup Express
const app = express();
secureExpressApp(app);

// Set up CORS (free access to the API from browser clients)
app.use(cors());

const messageContainerName = getRequiredStringEnv("MESSAGE_CONTAINER_NAME");

const messageModel = new MessageModel(
  cosmosdbInstance.container(MESSAGE_COLLECTION_NAME),
  messageContainerName
);

const serviceModel = new ServiceModel(
  cosmosdbInstance.container(SERVICE_COLLECTION_NAME)
);

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
