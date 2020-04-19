import { AzureFunction } from "@azure/functions";
import { createBlobService } from "azure-storage";

import {
  MESSAGE_COLLECTION_NAME,
  MessageModel
} from "io-functions-commons/dist/src/models/message";
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "io-functions-commons/dist/src/models/profile";
import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { documentClient } from "../utils/cosmosdb";
import { getStoreMessageContentActivityHandler } from "./handler";

// Setup DocumentDB
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const documentDbDatabaseUrl = documentDbUtils.getDatabaseUri(cosmosDbName);

const profilesCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  PROFILE_COLLECTION_NAME
);
const profileModel = new ProfileModel(documentClient, profilesCollectionUrl);

const messagesCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  MESSAGE_COLLECTION_NAME
);
const messageContainerName = getRequiredStringEnv("MESSAGE_CONTAINER_NAME");
const messageModel = new MessageModel(
  documentClient,
  messagesCollectionUrl,
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
