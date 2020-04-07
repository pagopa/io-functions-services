import { AzureFunction } from "@azure/functions";

import { DocumentClient as DocumentDBClient } from "documentdb";

import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "io-functions-commons/dist/src/models/notification";

import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";

import {
  TelemetryClient,
  wrapCustomTelemetryClient
} from "io-functions-commons/dist/src/utils/application_insights";

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

// Whether we're in a production environment
const isProduction = process.env.NODE_ENV === "production";

// Webhook must be an https endpoint
const abortableFetch = AbortableFetch(agent.getHttpsFetch(process.env));
// 10 seconds timeout by default
const fetchWithTimeout = setFetchTimeout(
  (process.env.FETCH_KEEPALIVE_TIMEOUT
    ? parseInt(process.env.FETCH_KEEPALIVE_TIMEOUT, 10)
    : 10000) as Millisecond,
  abortableFetch
);
const notifyApiCall = getNotifyClient(toFetch(fetchWithTimeout));

const getCustomTelemetryClient = wrapCustomTelemetryClient(
  isProduction,
  new TelemetryClient()
);

const activityFunction: AzureFunction = getWebhookNotificationActivityHandler(
  getCustomTelemetryClient,
  notificationModel,
  notifyApiCall
);

export default activityFunction;
