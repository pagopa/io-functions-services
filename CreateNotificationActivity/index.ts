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
import { DocumentClient as DocumentDBClient } from "documentdb";

import { HttpsUrl } from "io-functions-commons/dist/generated/definitions/HttpsUrl";
import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "io-functions-commons/dist/src/models/notification";
import {
  SENDER_SERVICE_COLLECTION_NAME,
  SenderServiceModel
} from "io-functions-commons/dist/src/models/sender_service";
import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { getCreateNotificationActivityHandler } from "./handler";

// Setup DocumentDB
const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
const cosmosDbKey = getRequiredStringEnv("COSMOSDB_KEY");
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const documentDbDatabaseUrl = documentDbUtils.getDatabaseUri(cosmosDbName);

// We create the db client, services and models here
// as if any error occurs during the construction of these objects
// that would be unrecoverable anyway and we neither may trig a retry
const documentClient = new DocumentDBClient(cosmosDbUri, {
  masterKey: cosmosDbKey
});

const notificationsCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  NOTIFICATION_COLLECTION_NAME
);
const notificationModel = new NotificationModel(
  documentClient,
  notificationsCollectionUrl
);

const senderServicesCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  SENDER_SERVICE_COLLECTION_NAME
);
const senderServiceModel = new SenderServiceModel(
  documentClient,
  senderServicesCollectionUrl
);

const defaultWebhookUrl = HttpsUrl.decode(
  getRequiredStringEnv("WEBHOOK_CHANNEL_URL")
).getOrElseL(_ => {
  throw new Error(
    `Check that the environment variable WEBHOOK_CHANNEL_URL is set to a valid URL`
  );
});

const activityFunctionHandler: AzureFunction = getCreateNotificationActivityHandler(
  senderServiceModel,
  notificationModel,
  defaultWebhookUrl
);

export default activityFunctionHandler;
