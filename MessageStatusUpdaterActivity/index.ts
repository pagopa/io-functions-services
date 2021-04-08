import { AzureFunction } from "@azure/functions";
import {
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/message_status";

import { cosmosdbInstance } from "../utils/cosmosdb";
import { getMessageStatusUpdaterActivityHandler } from "./handler";

const messageStatusModel = new MessageStatusModel(
  cosmosdbInstance.container(MESSAGE_STATUS_COLLECTION_NAME)
);

const messageStatusUpdaterActivityHandler: AzureFunction = getMessageStatusUpdaterActivityHandler(
  messageStatusModel
);

export default messageStatusUpdaterActivityHandler;
