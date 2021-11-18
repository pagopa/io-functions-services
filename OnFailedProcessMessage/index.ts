import { AzureFunction } from "@azure/functions";

import {
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { getConfigOrThrow } from "../utils/config";
import { initTelemetryClient } from "../utils/appinsights";
import { getOnFailedProcessMessageHandler } from "./handler";

const config = getConfigOrThrow();

const messageStatusModel = new MessageStatusModel(
  cosmosdbInstance.container(MESSAGE_STATUS_COLLECTION_NAME)
);

const telemetryClient = initTelemetryClient(
  config.APPINSIGHTS_INSTRUMENTATIONKEY
);

const activityFunctionHandler: AzureFunction = getOnFailedProcessMessageHandler(
  {
    lMessageStatusModel: messageStatusModel,
    telemetryClient
  }
);

export default activityFunctionHandler;
