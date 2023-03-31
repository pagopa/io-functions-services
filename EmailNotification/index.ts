import { AzureFunction } from "@azure/functions";

import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "@pagopa/io-functions-commons/dist/src/models/notification";

import { getMailerTransporter } from "@pagopa/io-functions-commons/dist/src/mailer";
import { createBlobService } from "azure-storage";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { getConfigOrThrow } from "../utils/config";
import { CommonMessageData } from "../utils/events/message";
import { makeRetrieveExpandedDataFromBlob } from "../utils/with-expanded-input";
import { getEmailNotificationHandler } from "./handler";

const config = getConfigOrThrow();

const notificationModel = new NotificationModel(
  cosmosdbInstance.container(NOTIFICATION_COLLECTION_NAME)
);

//
// options used when converting an HTML message to pure text
// see https://www.npmjs.com/package/html-to-text#options
//
const HTML_TO_TEXT_OPTIONS: HtmlToTextOptions = {
  ignoreImage: true, // ignore all document images
  tables: true
};

// default sender for email
const MAIL_FROM = config.MAIL_FROM;

const mailerTransporter = getMailerTransporter(config);

const blobService = createBlobService(
  config.INTERNAL_STORAGE_CONNECTION_STRING
);

const retrieveProcessingMessageData = makeRetrieveExpandedDataFromBlob(
  CommonMessageData,
  blobService,
  config.PROCESSING_MESSAGE_CONTAINER_NAME
);

const activityFunction: AzureFunction = getEmailNotificationHandler(
  mailerTransporter,
  notificationModel,
  retrieveProcessingMessageData,
  {
    HTML_TO_TEXT_OPTIONS,
    MAIL_FROM
  },
  config
);

export default activityFunction;
