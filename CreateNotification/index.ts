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

import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { HttpsUrl } from "@pagopa/io-functions-commons/dist/generated/definitions/HttpsUrl";

import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import { createBlobService } from "azure-storage";
import { cosmosdbInstance } from "../utils/cosmosdb";

import { getConfigOrThrow } from "../utils/config";
import { makeRetrieveExpandedDataFromBlob } from "../utils/with-expanded-input";
import { CommonMessageData } from "../utils/events/message";
import { getCreateNotificationHandler } from "./handler";

const config = getConfigOrThrow();

const sandboxFiscalCode = pipe(
  FiscalCode.decode(config.SANDBOX_FISCAL_CODE),
  E.getOrElse(_ => {
    throw new Error(
      `Check that the environment variable SANDBOX_FISCAL_CODE is set to a valid FiscalCode`
    );
  })
);

const emailNotificationServiceBlackList =
  config.EMAIL_NOTIFICATION_SERVICE_BLACKLIST;

const webhookNotificationServiceBlackList =
  config.WEBHOOK_NOTIFICATION_SERVICE_BLACKLIST;

const notificationModel = new NotificationModel(
  cosmosdbInstance.container(NOTIFICATION_COLLECTION_NAME)
);

const defaultWebhookUrl = pipe(
  HttpsUrl.decode(config.WEBHOOK_CHANNEL_URL),
  E.getOrElse(_ => {
    throw new Error(
      `Check that the environment variable WEBHOOK_CHANNEL_URL is set to a valid URL`
    );
  })
);

const blobService = createBlobService(
  config.INTERNAL_STORAGE_CONNECTION_STRING
);

const retrieveProcessingMessageData = makeRetrieveExpandedDataFromBlob(
  CommonMessageData,
  blobService,
  config.PROCESSING_MESSAGE_CONTAINER_NAME
);

const functionHandler: AzureFunction = getCreateNotificationHandler(
  notificationModel,
  defaultWebhookUrl,
  sandboxFiscalCode,
  emailNotificationServiceBlackList,
  webhookNotificationServiceBlackList,
  retrieveProcessingMessageData
);

export default functionHandler;
