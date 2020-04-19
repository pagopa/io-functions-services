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

import { AzureFunction } from "@azure/functions";

import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";

import {
  NOTIFICATION_STATUS_COLLECTION_NAME,
  NotificationStatusModel
} from "io-functions-commons/dist/src/models/notification_status";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { documentClient } from "../utils/cosmosdb";
import { getNotificationStatusUpdaterActivityHandler } from "./handler";

// Setup DocumentDB

const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const documentDbDatabaseUrl = documentDbUtils.getDatabaseUri(cosmosDbName);

const notificationStatusCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  NOTIFICATION_STATUS_COLLECTION_NAME
);

const notificationStatusModel = new NotificationStatusModel(
  documentClient,
  notificationStatusCollectionUrl
);

const activityFunction: AzureFunction = getNotificationStatusUpdaterActivityHandler(
  notificationStatusModel
);

export default activityFunction;
