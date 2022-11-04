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
import {
  ActivationModel,
  ACTIVATION_COLLECTION_NAME
} from "@pagopa/io-functions-commons/dist/src/models/activation";
import { Second } from "@pagopa/ts-commons/lib/units";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { getConfigOrThrow } from "../utils/config";
import { initTelemetryClient } from "../utils/appinsights";
import { CommonMessageData } from "../utils/events/message";
import { makeRetrieveExpandedDataFromBlob } from "../utils/with-expanded-input";
import { getIsUserForFeatureFlag } from "../utils/featureFlags";
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

const activationModel = new ActivationModel(
  cosmosdbInstance.container(ACTIVATION_COLLECTION_NAME)
);

const telemetryClient = initTelemetryClient(
  config.APPINSIGHTS_INSTRUMENTATIONKEY
);

const retrieveProcessingMessageData = makeRetrieveExpandedDataFromBlob(
  CommonMessageData,
  blobServiceForTemporaryProcessingMessage,
  config.PROCESSING_MESSAGE_CONTAINER_NAME
);

const isUserForFeatureFlag = getIsUserForFeatureFlag(
  (fc: FiscalCode) => config.BETA_USERS.includes(fc),
  (_: FiscalCode) => false,
  config.FEATURE_FLAG
);

const activityFunctionHandler: AzureFunction = getProcessMessageHandler({
  TTL_FOR_USER_NOT_FOUND: config.TTL_FOR_USER_NOT_FOUND,
  isOptInEmailEnabled: config.FF_OPT_IN_EMAIL_ENABLED,
  isUserForFeatureFlag,
  lActivation: activationModel,
  lBlobService: blobServiceForMessageContent,
  lMessageModel: messageModel,
  lMessageStatusModel: messageStatusModel,
  lProfileModel: profileModel,
  lServicePreferencesModel: servicePreferencesModel,
  optOutEmailSwitchDate: config.OPT_OUT_EMAIL_SWITCH_DATE,
  pendingActivationGracePeriod: config.PENDING_ACTIVATION_GRACE_PERIOD_SECONDS as Second,
  retrieveProcessingMessageData,
  telemetryClient
});

export default activityFunctionHandler;
