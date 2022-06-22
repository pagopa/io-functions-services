import { Context } from "@azure/functions";
import { createBlobService } from "azure-storage";
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

import {
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import {
  NOTIFICATION_STATUS_COLLECTION_NAME,
  NotificationStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { cosmosdbInstance } from "../utils/cosmosdb";

import { getConfigOrThrow } from "../utils/config";
import { paymentUpdaterClient } from "../clients/payment-updater";
import { GetMessage } from "./handler";

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

const messageStatusModel = new MessageStatusModel(
  cosmosdbInstance.container(MESSAGE_STATUS_COLLECTION_NAME)
);

const notificationModel = new NotificationModel(
  cosmosdbInstance.container(NOTIFICATION_COLLECTION_NAME)
);

const notificationStatusModel = new NotificationStatusModel(
  cosmosdbInstance.container(NOTIFICATION_STATUS_COLLECTION_NAME)
);

const blobService = createBlobService(
  config.MESSAGE_CONTENT_STORAGE_CONNECTION_STRING
);

app.get(
  "/api/v1/messages/:fiscalcode/:id/:senderEmail?",
  GetMessage(
    serviceModel,
    messageModel,
    messageStatusModel,
    notificationModel,
    notificationStatusModel,
    blobService,
    paymentUpdaterClient
  )
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function httpStart(context: Context): void {
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
