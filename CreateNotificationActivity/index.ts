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

import { FiscalCode } from "io-functions-commons/dist/generated/definitions/FiscalCode";
import { HttpsUrl } from "io-functions-commons/dist/generated/definitions/HttpsUrl";
import { ServiceId } from "io-functions-commons/dist/generated/definitions/ServiceId";
import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "io-functions-commons/dist/src/models/notification";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { getCreateNotificationActivityHandler } from "./handler";
import { parseCommaSeparatedListOf } from "./utils";

const sandboxFiscalCode = FiscalCode.decode(
  getRequiredStringEnv("SANDBOX_FISCAL_CODE")
).getOrElseL(_ => {
  throw new Error(
    `Check that the environment variable SANDBOX_FISCAL_CODE is set to a valid FiscalCode`
  );
});

const emailNotificationServiceBlackList = parseCommaSeparatedListOf(ServiceId)(
  process.env.EMAIL_NOTIFICATION_SERVICE_BLACKLIST
).getOrElseL(_ => {
  throw new Error(
    `Check that the environment variable EMAIL_NOTIFICATION_SERVICE_BLACKLIST is either unset or set to a comma-separated list of valid ServiceId`
  );
});

// Setup DocumentDB
const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");
const cosmosDbKey = getRequiredStringEnv("COSMOSDB_KEY");

const cosmosdbClient = new CosmosClient({
  endpoint: cosmosDbUri,
  key: cosmosDbKey
});

const notificationModel = new NotificationModel(
  cosmosdbClient.database(cosmosDbName).container(NOTIFICATION_COLLECTION_NAME)
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
  sandboxFiscalCode,
  emailNotificationServiceBlackList
);

export default activityFunctionHandler;
