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
import { cosmosdbInstance } from "../utils/cosmosdb";
import { getConfigOrThrow } from "../utils/config";
import { initTelemetryClient } from "../utils/appinsights";
import { getStoreMessageContentActivityHandler } from "./handler";

const config = getConfigOrThrow();

const profileModel = new ProfileModel(
  cosmosdbInstance.container(PROFILE_COLLECTION_NAME)
);

const messageModel = new MessageModel(
  cosmosdbInstance.container(MESSAGE_COLLECTION_NAME),
  config.MESSAGE_CONTAINER_NAME
);

const blobService = createBlobService(config.QueueStorageConnection);

const servicePreferencesModel = new ServicesPreferencesModel(
  cosmosdbInstance.container(SERVICE_PREFERENCES_COLLECTION_NAME),
  SERVICE_PREFERENCES_COLLECTION_NAME
);

const telemetryClient = initTelemetryClient(
  config.APPINSIGHTS_INSTRUMENTATIONKEY
);

const activityFunctionHandler: AzureFunction = getStoreMessageContentActivityHandler(
  {
    isOptInEmailEnabled: config.FF_OPT_IN_EMAIL_ENABLED,
    lBlobService: blobService,
    lMessageModel: messageModel,
    lProfileModel: profileModel,
    lServicePreferencesModel: servicePreferencesModel,
    optOutEmailSwitchDate: config.OPT_OUT_EMAIL_SWITCH_DATE,
    telemetryClient
  }
);

export default activityFunctionHandler;
