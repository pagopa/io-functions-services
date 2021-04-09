import { AzureFunction } from "@azure/functions";
import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "@pagopa/io-functions-commons/dist/src/models/notification";

import { agent } from "italia-ts-commons";

import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "italia-ts-commons/lib/fetch";
import { Millisecond } from "italia-ts-commons/lib/units";
import { cosmosdbInstance } from "../utils/cosmosdb";

import { getNotifyClient } from "./client";
import { getWebhookNotificationActivityHandler } from "./handler";

const notificationModel = new NotificationModel(
  cosmosdbInstance.container(NOTIFICATION_COLLECTION_NAME)
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
