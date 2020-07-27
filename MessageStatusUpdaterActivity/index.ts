import { CosmosClient } from "@azure/cosmos";
import { AzureFunction } from "@azure/functions";
import {
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel
} from "io-functions-commons/dist/src/models/message_status";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { getMessageStatusUpdaterActivityHandler } from "./handler";

// Setup DocumentDB
const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");
const cosmosDbKey = getRequiredStringEnv("COSMOSDB_KEY");

const cosmosdbClient = new CosmosClient({
  endpoint: cosmosDbUri,
  key: cosmosDbKey
});

const messageStatusModel = new MessageStatusModel(
  cosmosdbClient
    .database(cosmosDbName)
    .container(MESSAGE_STATUS_COLLECTION_NAME)
);

const messageStatusUpdaterActivityHandler: AzureFunction = getMessageStatusUpdaterActivityHandler(
  messageStatusModel
);

export default messageStatusUpdaterActivityHandler;
