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
import { cosmosdbInstance } from "../utils/cosmosdb";

import * as NodeMailer from "nodemailer";

import { agent } from "italia-ts-commons";

import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "io-functions-commons/dist/src/models/notification";

import { getEmailNotificationActivityHandler } from "./handler";

import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "italia-ts-commons/lib/fetch";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { Millisecond } from "italia-ts-commons/lib/units";
import nodemailerSendgrid = require("nodemailer-sendgrid");

import { MailUpTransport } from "io-functions-commons/dist/src/mailer/transports";
import { getConfigOrThrow } from "../utils/config";

const config = getConfigOrThrow();

//
//  setup SendGrid
//
const SendgridTransport = NonEmptyString.decode(config.SENDGRID_API_KEY)
  .map(sendgridApiKey =>
    nodemailerSendgrid({
      apiKey: sendgridApiKey
    })
  )
  .getOrElse(undefined);

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

// 5 seconds timeout by default
const DEFAULT_EMAIL_REQUEST_TIMEOUT_MS = 5000;

// Must be an https endpoint so we use an https agent
const abortableFetch = AbortableFetch(agent.getHttpsFetch(process.env));
const fetchWithTimeout = setFetchTimeout(
  DEFAULT_EMAIL_REQUEST_TIMEOUT_MS as Millisecond,
  abortableFetch
);

// Whether we're in a production environment
const mailhogHostname: string = config.MAILHOG_HOSTNAME || "localhost";

const mailerTransporter = NodeMailer.createTransport(
  config.isProduction
    ? SendgridTransport !== undefined
      ? SendgridTransport
      : MailUpTransport({
          creds: {
            Secret: config.MAILUP_SECRET,
            Username: config.MAILUP_USERNAME
          },
          fetchAgent: toFetch(fetchWithTimeout)
        })
    : // For development we use mailhog to intercept emails
      {
        host: mailhogHostname,
        port: 1025,
        secure: false
      }
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
