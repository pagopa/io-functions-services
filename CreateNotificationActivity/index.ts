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

import { FiscalCode } from "io-functions-commons/dist/generated/definitions/FiscalCode";
import { HttpsUrl } from "io-functions-commons/dist/generated/definitions/HttpsUrl";
import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "io-functions-commons/dist/src/models/notification";
import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { documentClient } from "../utils/cosmosdb";
import { getCreateNotificationActivityHandler } from "./handler";

const sandboxFiscalCode = FiscalCode.decode(
  getRequiredStringEnv("SANDBOX_FISCAL_CODE")
).getOrElseL(_ => {
  throw new Error(
    `Check that the environment variable SANDBOX_FISCAL_CODE is set to a valid FiscalCode`
  );
});

// Setup DocumentDB
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const documentDbDatabaseUrl = documentDbUtils.getDatabaseUri(cosmosDbName);

const notificationsCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  NOTIFICATION_COLLECTION_NAME
);
const notificationModel = new NotificationModel(
  documentClient,
  notificationsCollectionUrl
);

const defaultWebhookUrl = HttpsUrl.decode(
  getRequiredStringEnv("WEBHOOK_CHANNEL_URL")
).getOrElseL(_ => {
  throw new Error(
    `Check that the environment variable WEBHOOK_CHANNEL_URL is set to a valid URL`
  );
});

const activityFunctionHandler: AzureFunction = getCreateNotificationActivityHandler(
  notificationModel,
  defaultWebhookUrl,
  sandboxFiscalCode
);

export default activityFunctionHandler;
