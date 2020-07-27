/*
 * This function is not intended to be invoked directly. Instead it will be
 * triggered by an orchestrator function.
 *
 * Before running this sample, please:
 * - create a Durable orchestration function
 * - create a Durable HTTP starter function
 * - run 'npm install durable-functions' from the wwwroot folder of your
 *   function app in Kudu
 */
import { CosmosClient } from "@azure/cosmos";
import { AzureFunction } from "@azure/functions";

import {
  NOTIFICATION_STATUS_COLLECTION_NAME,
  NotificationStatusModel
} from "io-functions-commons/dist/src/models/notification_status";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { getNotificationStatusUpdaterActivityHandler } from "./handler";

// Setup DocumentDB
const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");
const cosmosDbKey = getRequiredStringEnv("COSMOSDB_KEY");

const cosmosdbClient = new CosmosClient({
  endpoint: cosmosDbUri,
  key: cosmosDbKey
});

const notificationStatusModel = new NotificationStatusModel(
  cosmosdbClient
    .database(cosmosDbName)
    .container(NOTIFICATION_STATUS_COLLECTION_NAME)
);

const activityFunction: AzureFunction = getNotificationStatusUpdaterActivityHandler(
  notificationStatusModel
);

export default activityFunction;
