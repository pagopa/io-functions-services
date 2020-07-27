import { CosmosClient } from "@azure/cosmos";
import { Context } from "@azure/functions";
import { createBlobService } from "azure-storage";
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

import {
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel
} from "io-functions-commons/dist/src/models/message_status";
import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "io-functions-commons/dist/src/models/notification";
import {
  NOTIFICATION_STATUS_COLLECTION_NAME,
  NotificationStatusModel
} from "io-functions-commons/dist/src/models/notification_status";

import { GetMessage } from "./handler";

// Setup Express
const app = express();
secureExpressApp(app);

// Set up CORS (free access to the API from browser clients)
app.use(cors());

// Setup DocumentDB
const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");
const cosmosDbKey = getRequiredStringEnv("COSMOSDB_KEY");

const cosmosdbClient = new CosmosClient({
  endpoint: cosmosDbUri,
  key: cosmosDbKey
});

const messageContainerName = getRequiredStringEnv("MESSAGE_CONTAINER_NAME");

const messageModel = new MessageModel(
  cosmosdbClient.database(cosmosDbName).container(MESSAGE_COLLECTION_NAME),
  messageContainerName
);

const serviceModel = new ServiceModel(
  cosmosdbClient.database(cosmosDbName).container(SERVICE_COLLECTION_NAME)
);

const messageStatusModel = new MessageStatusModel(
  cosmosdbClient
    .database(cosmosDbName)
    .container(MESSAGE_STATUS_COLLECTION_NAME)
);

const notificationModel = new NotificationModel(
  cosmosdbClient.database(cosmosDbName).container(NOTIFICATION_COLLECTION_NAME)
);

const notificationStatusModel = new NotificationStatusModel(
  cosmosdbClient
    .database(cosmosDbName)
    .container(NOTIFICATION_STATUS_COLLECTION_NAME)
);

const storageConnectionString = getRequiredStringEnv("QueueStorageConnection");
const blobService = createBlobService(storageConnectionString);

app.get(
  "/api/v1/messages/:fiscalcode/:id",
  GetMessage(
    serviceModel,
    messageModel,
    messageStatusModel,
    notificationModel,
    notificationStatusModel,
    blobService
  )
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
