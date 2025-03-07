import { Context } from "@azure/functions";
import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";
import {
  MESSAGE_COLLECTION_NAME,
  MessageModel
} from "@pagopa/io-functions-commons/dist/src/models/message";
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
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  SERVICE_PREFERENCES_COLLECTION_NAME,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { createBlobService } from "azure-storage";
import * as cors from "cors";
import * as express from "express";

import { pagoPaEcommerceClient } from "../clients/pagopa-ecommerce";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { GetMessage } from "./handler";
import { canAccessMessageReadStatus } from "./userPreferenceChecker/messageReadStatusAuth";

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

const profileModel = new ProfileModel(
  cosmosdbInstance.container(PROFILE_COLLECTION_NAME)
);

const servicePreferencesModel = new ServicesPreferencesModel(
  cosmosdbInstance.container(SERVICE_PREFERENCES_COLLECTION_NAME),
  SERVICE_PREFERENCES_COLLECTION_NAME
);

const blobService = createBlobService(
  config.MESSAGE_CONTENT_STORAGE_CONNECTION_STRING
);

app.get(
  "/api/v1/messages/:fiscalcode/:id/:senderEmail?",
  GetMessage(
    config,
    serviceModel,
    messageModel,
    messageStatusModel,
    notificationModel,
    notificationStatusModel,
    blobService,
    canAccessMessageReadStatus(
      profileModel,
      servicePreferencesModel,
      config.MIN_APP_VERSION_WITH_READ_AUTH
    ),
    pagoPaEcommerceClient
  )
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
