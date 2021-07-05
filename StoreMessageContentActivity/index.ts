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
import { cosmosdbInstance } from "../utils/cosmosdb";
import { getConfigOrThrow } from "../utils/config";
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

const activityFunctionHandler: AzureFunction = getStoreMessageContentActivityHandler(
  profileModel,
  messageModel,
  blobService,
  config.OPT_OUT_EMAIL_SWITCH_DATE
);

export default activityFunctionHandler;
