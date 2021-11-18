import { AzureFunction } from "@azure/functions";
import { createBlobService } from "azure-storage";

import {
  MESSAGE_COLLECTION_NAME,
  MessageModel
} from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  ServicesPreferencesModel,
  SERVICE_PREFERENCES_COLLECTION_NAME
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import {
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { getConfigOrThrow } from "../utils/config";
import { initTelemetryClient } from "../utils/appinsights";
import { CommonMessageData } from "../utils/events/message";
import { makeRetrieveExpandedDataFromBlob } from "../utils/with-expanded-input";
import { getProcessMessageHandler } from "./handler";

const config = getConfigOrThrow();

const profileModel = new ProfileModel(
  cosmosdbInstance.container(PROFILE_COLLECTION_NAME)
);

const messageModel = new MessageModel(
  cosmosdbInstance.container(MESSAGE_COLLECTION_NAME),
  config.MESSAGE_CONTAINER_NAME
);

const blobServiceForMessageContent = createBlobService(
  config.MESSAGE_CONTENT_STORAGE_CONNECTION_STRING
);

const blobServiceForTemporaryProcessingMessage = createBlobService(
  config.INTERNAL_STORAGE_CONNECTION_STRING
);

const servicePreferencesModel = new ServicesPreferencesModel(
  cosmosdbInstance.container(SERVICE_PREFERENCES_COLLECTION_NAME),
  SERVICE_PREFERENCES_COLLECTION_NAME
);

const messageStatusModel = new MessageStatusModel(
  cosmosdbInstance.container(MESSAGE_STATUS_COLLECTION_NAME)
);

const telemetryClient = initTelemetryClient(
  config.APPINSIGHTS_INSTRUMENTATIONKEY
);

const retrieveProcessingMessageData = makeRetrieveExpandedDataFromBlob(
  CommonMessageData,
  blobServiceForTemporaryProcessingMessage,
  config.PROCESSING_MESSAGE_CONTAINER_NAME
);

const activityFunctionHandler: AzureFunction = getProcessMessageHandler({
  isOptInEmailEnabled: config.FF_OPT_IN_EMAIL_ENABLED,
  lBlobService: blobServiceForMessageContent,
  lMessageModel: messageModel,
  lMessageStatusModel: messageStatusModel,
  lProfileModel: profileModel,
  lServicePreferencesModel: servicePreferencesModel,
  optOutEmailSwitchDate: config.OPT_OUT_EMAIL_SWITCH_DATE,
  retrieveProcessingMessageData,
  telemetryClient
});

export default activityFunctionHandler;
