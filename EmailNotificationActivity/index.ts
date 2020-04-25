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

import { agent } from "italia-ts-commons";

import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "io-functions-commons/dist/src/models/notification";
import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { MailUpTransport } from "io-functions-commons/dist/src/utils/mailup";

import { documentClient } from "../utils/cosmosdb";
import { getEmailNotificationActivityHandler } from "./handler";

import { NonEmptyString } from "italia-ts-commons/lib/strings";
import nodemailerSendgrid = require("nodemailer-sendgrid");

//
//  setup SendGrid
//
const SendgridTransport = NonEmptyString.decode(process.env.SENDGRID_API_KEY)
  .map(sendgridApiKey =>
    nodemailerSendgrid({
      apiKey: sendgridApiKey
    })
  )
  .getOrElse(undefined);

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
  SendgridTransport !== undefined
    ? SendgridTransport
    : MailUpTransport({
        creds: {
          Secret: mailupSecret,
          Username: mailupUsername
        },
        fetchAgent: agent.getHttpsFetch(process.env)
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
