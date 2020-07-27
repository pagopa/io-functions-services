import { CosmosClient } from "@azure/cosmos";
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
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { getStoreMessageContentActivityHandler } from "./handler";

// Setup DocumentDB
// Setup DocumentDB
const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");
const cosmosDbKey = getRequiredStringEnv("COSMOSDB_KEY");

const cosmosdbClient = new CosmosClient({
  endpoint: cosmosDbUri,
  key: cosmosDbKey
});

const profileModel = new ProfileModel(
  cosmosdbClient.database(cosmosDbName).container(PROFILE_COLLECTION_NAME)
);

const messageContainerName = getRequiredStringEnv("MESSAGE_CONTAINER_NAME");
const messageModel = new MessageModel(
  cosmosdbClient.database(cosmosDbName).container(MESSAGE_COLLECTION_NAME),
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
