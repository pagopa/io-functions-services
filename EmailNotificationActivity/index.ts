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

import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "@pagopa/io-functions-commons/dist/src/models/notification";

import { getMailerTransporter } from "@pagopa/io-functions-commons/dist/src/mailer";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { getConfigOrThrow } from "../utils/config";
import { getEmailNotificationActivityHandler } from "./handler";

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

const activityFunction: AzureFunction = getEmailNotificationActivityHandler(
  mailerTransporter,
  notificationModel,
  {
    HTML_TO_TEXT_OPTIONS,
    MAIL_FROM
  }
);

export default activityFunction;
