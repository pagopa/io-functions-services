import { AzureFunction } from "@azure/functions";
import { createBlobService } from "azure-storage";
import { cosmosdbInstance } from "../utils/cosmosdb";

import {
  MESSAGE_COLLECTION_NAME,
  MessageModel
} from "io-functions-commons/dist/src/models/message";
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "io-functions-commons/dist/src/models/profile";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { getStoreMessageContentActivityHandler } from "./handler";

const profileModel = new ProfileModel(
  cosmosdbInstance.container(PROFILE_COLLECTION_NAME)
);

const messageContainerName = getRequiredStringEnv("MESSAGE_CONTAINER_NAME");
const messageModel = new MessageModel(
  cosmosdbInstance.container(MESSAGE_COLLECTION_NAME),
  messageContainerName
);

const storageConnectionString = getRequiredStringEnv("QueueStorageConnection");
const blobService = createBlobService(storageConnectionString);

const activityFunctionHandler: AzureFunction = getStoreMessageContentActivityHandler(
  profileModel,
  messageModel,
  blobService
);

export default activityFunctionHandler;
