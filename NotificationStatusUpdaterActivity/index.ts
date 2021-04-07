/*
 * This function is not intended to be invoked directly. Instead it will be
 * triggered by an orchestrator function.
 *
 * Before running this sample, please:
 * - create a Durable orchestration function
 * - create a Durable HTTP starter function
 * - run 'npm install durable-functions' from the wwwroot folder of your
 *   function app in Kudu
 *
 */

import { AzureFunction } from "@azure/functions";

import {
  NOTIFICATION_STATUS_COLLECTION_NAME,
  NotificationStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { getNotificationStatusUpdaterActivityHandler } from "./handler";

const notificationStatusModel = new NotificationStatusModel(
  cosmosdbInstance.container(NOTIFICATION_STATUS_COLLECTION_NAME)
);

const activityFunction: AzureFunction = getNotificationStatusUpdaterActivityHandler(
  notificationStatusModel
);

export default activityFunction;
