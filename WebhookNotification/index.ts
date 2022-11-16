import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import {
  ProfileModel,
  PROFILE_COLLECTION_NAME
} from "@pagopa/io-functions-commons/dist/src/models/profile";

import { agent } from "@pagopa/ts-commons";

import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "@pagopa/ts-commons/lib/fetch";
import { Millisecond } from "@pagopa/ts-commons/lib/units";
import { createBlobService } from "azure-storage";
import { getUserProfileReader } from "../readers/user-profile";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { CommonMessageData } from "../utils/events/message";
import { makeRetrieveExpandedDataFromBlob } from "../utils/with-expanded-input";

import { getNotifyClient } from "./client";
import { getWebhookNotificationHandler } from "./handler";

const config = getConfigOrThrow();

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

const blobService = createBlobService(
  config.INTERNAL_STORAGE_CONNECTION_STRING
);

const retrieveProcessingMessageData = makeRetrieveExpandedDataFromBlob(
  CommonMessageData,
  blobService,
  config.PROCESSING_MESSAGE_CONTAINER_NAME
);

const profileModel = new ProfileModel(
  cosmosdbInstance.container(PROFILE_COLLECTION_NAME)
);

export default getWebhookNotificationHandler(
  notificationModel,
  notifyApiCall,
  retrieveProcessingMessageData,
  getUserProfileReader(profileModel),
  config.FF_DISABLE_WEBHOOK_MESSAGE_CONTENT
);
