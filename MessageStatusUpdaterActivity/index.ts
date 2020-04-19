import { AzureFunction } from "@azure/functions";

import {
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel
} from "io-functions-commons/dist/src/models/message_status";
import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { documentClient } from "../utils/cosmosdb";
import { getMessageStatusUpdaterActivityHandler } from "./handler";

const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const documentDbDatabaseUrl = documentDbUtils.getDatabaseUri(cosmosDbName);

const messagesStatusCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  MESSAGE_STATUS_COLLECTION_NAME
);
const messageStatusModel = new MessageStatusModel(
  documentClient,
  messagesStatusCollectionUrl
);

const messageStatusUpdaterActivityHandler: AzureFunction = getMessageStatusUpdaterActivityHandler(
  messageStatusModel
);

export default messageStatusUpdaterActivityHandler;
