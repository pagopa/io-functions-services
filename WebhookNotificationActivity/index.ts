import { CosmosClient } from "@azure/cosmos";
import { AzureFunction } from "@azure/functions";
import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "io-functions-commons/dist/src/models/notification";

import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { agent } from "italia-ts-commons";

import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "italia-ts-commons/lib/fetch";
import { Millisecond } from "italia-ts-commons/lib/units";

import { getNotifyClient } from "./client";
import { getWebhookNotificationActivityHandler } from "./handler";

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

// 5 seconds timeout by default
const DEFAULT_NOTIFY_REQUEST_TIMEOUT_MS = 5000;

// Webhook must be an https endpoint so we use an https agent
const abortableFetch = AbortableFetch(agent.getHttpsFetch(process.env));
const fetchWithTimeout = setFetchTimeout(
  DEFAULT_NOTIFY_REQUEST_TIMEOUT_MS as Millisecond,
  abortableFetch
);
const notifyApiCall = getNotifyClient(toFetch(fetchWithTimeout));

const activityFunction: AzureFunction = getWebhookNotificationActivityHandler(
  notificationModel,
  notifyApiCall
);

export default activityFunction;
