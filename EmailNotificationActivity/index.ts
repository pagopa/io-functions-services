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

import * as NodeMailer from "nodemailer";

import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "io-functions-commons/dist/src/models/notification";
import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { MailUpTransport } from "io-functions-commons/dist/src/utils/mailup";

import { getDocumentClient } from "../utils/cosmosdb";
import { getEmailNotificationActivityHandler } from "./handler";

// Setup DocumentDB
const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
const cosmosDbKey = getRequiredStringEnv("COSMOSDB_KEY");
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const documentDbDatabaseUrl = documentDbUtils.getDatabaseUri(cosmosDbName);

// We create the db client, services and models here
// as if any error occurs during the construction of these objects
// that would be unrecoverable anyway and we neither may trig a retry
const documentClient = getDocumentClient(cosmosDbUri, cosmosDbKey);

const notificationsCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  NOTIFICATION_COLLECTION_NAME
);
const notificationModel = new NotificationModel(
  documentClient,
  notificationsCollectionUrl
);

//
// setup NodeMailer
//
const mailupUsername = getRequiredStringEnv("MAILUP_USERNAME");
const mailupSecret = getRequiredStringEnv("MAILUP_SECRET");

//
// options used when converting an HTML message to pure text
// see https://www.npmjs.com/package/html-to-text#options
//

const HTML_TO_TEXT_OPTIONS: HtmlToTextOptions = {
  ignoreImage: true, // ignore all document images
  tables: true
};

// default sender for email
const MAIL_FROM = getRequiredStringEnv("MAIL_FROM_DEFAULT");

const mailerTransporter = NodeMailer.createTransport(
  MailUpTransport({
    creds: {
      Secret: mailupSecret,
      Username: mailupUsername
    }
  })
);

const activityFunction: AzureFunction = getEmailNotificationActivityHandler(
  mailerTransporter,
  notificationModel,
  {
    HTML_TO_TEXT_OPTIONS,
    MAIL_FROM
  }
);

export default activityFunction;
