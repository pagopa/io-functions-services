/*
 * This function is not intended to be invoked directly. Instead it will be
 * triggered by an HTTP starter function.
 *
 * Before running this sample, please:
 * - create a Durable activity function (default name is "Hello")
 * - create a Durable HTTP starter function
 * - run 'npm install durable-functions' from the wwwroot folder of your
 *    function app in Kudu
 */

import * as df from "durable-functions";
import { IFunctionContext } from "durable-functions/lib/src/classes";

import { ReadableReporter } from "italia-ts-commons/lib/reporters";

import * as t from "io-ts";

import * as winston from "winston";

import { Context } from "@azure/functions";

import { DocumentClient as DocumentDBClient } from "documentdb";

import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";

import { Set } from "json-set-map";

import { fromNullable, isNone, none, Option, some } from "fp-ts/lib/Option";

import {
  BlobService,
  createBlobService,
  createQueueService
} from "azure-storage";

import { NewMessageDefaultAddresses } from "io-functions-commons/dist/generated/definitions/NewMessageDefaultAddresses";

import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { CreatedMessageEvent } from "io-functions-commons/dist/src/models/created_message_event";
import {
  MESSAGE_COLLECTION_NAME,
  MessageModel,
  NewMessageWithoutContent
} from "io-functions-commons/dist/src/models/message";
import {
  createNewNotification,
  NewNotification,
  NOTIFICATION_COLLECTION_NAME,
  NotificationAddressSourceEnum,
  NotificationChannelEmail,
  NotificationModel
} from "io-functions-commons/dist/src/models/notification";
import { NotificationEvent } from "io-functions-commons/dist/src/models/notification_event";
import {
  IProfileBlockedInboxOrChannels,
  PROFILE_COLLECTION_NAME,
  ProfileModel,
  RetrievedProfile
} from "io-functions-commons/dist/src/models/profile";

import { Either, isLeft, left, right } from "fp-ts/lib/Either";
import { readableReport } from "italia-ts-commons/lib/reporters";

import {
  isRecipientError,
  RecipientError,
  RuntimeError,
  TransientError
} from "io-functions-commons/dist/src/utils/errors";

import { MessageStatusValueEnum } from "io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { NotificationChannelEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannel";

import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { withoutUndefinedValues } from "italia-ts-commons/lib/types";

import { BlockedInboxOrChannelEnum } from "io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { HttpsUrl } from "io-functions-commons/dist/generated/definitions/HttpsUrl";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import { TelemetryClient } from "io-functions-commons/dist/src/utils/application_insights";

import { CreatedMessageEventSenderMetadata } from "io-functions-commons/dist/src/models/created_message_sender_metadata";
import {
  getMessageStatusUpdater,
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel
} from "io-functions-commons/dist/src/models/message_status";
import {
  newSenderService,
  SENDER_SERVICE_COLLECTION_NAME,
  SenderServiceModel
} from "io-functions-commons/dist/src/models/sender_service";

import { wrapCustomTelemetryClient } from "io-functions-commons/dist/src/utils/application_insights";

import { ulidGenerator } from "io-functions-commons/dist/src/utils/strings";
import { AzureContextTransport } from "io-functions-commons/dist/src/utils/logging";
import { handleMessage } from "./handler";

// Whether we're in a production environment
const isProduction = process.env.NODE_ENV === "production";

const getCustomTelemetryClient = wrapCustomTelemetryClient(
  isProduction,
  new TelemetryClient()
);

// Setup DocumentDB
const cosmosDbUri = getRequiredStringEnv("CUSTOMCONNSTR_COSMOSDB_URI");
const cosmosDbKey = getRequiredStringEnv("CUSTOMCONNSTR_COSMOSDB_KEY");
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const documentDbDatabaseUrl = documentDbUtils.getDatabaseUri(cosmosDbName);
const profilesCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  PROFILE_COLLECTION_NAME
);
const messagesCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  MESSAGE_COLLECTION_NAME
);
const notificationsCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  NOTIFICATION_COLLECTION_NAME
);
const messageStatusCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  MESSAGE_STATUS_COLLECTION_NAME
);
const senderServicesCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  SENDER_SERVICE_COLLECTION_NAME
);

const defaultWebhookUrl = HttpsUrl.decode(
  getRequiredStringEnv("WEBHOOK_CHANNEL_URL")
).getOrElseL(_ => {
  throw new Error(
    `Check that the environment variable WEBHOOK_CHANNEL_URL is set to a valid URL`
  );
});

// must be equal to the queue name in function.json
export const MESSAGE_QUEUE_NAME = "createdmessages";

const messageContainerName = getRequiredStringEnv("MESSAGE_CONTAINER_NAME");
const storageConnectionString = getRequiredStringEnv("QueueStorageConnection");
const queueConnectionString = getRequiredStringEnv("QueueStorageConnection");

// We create the db client, services and models here
// as if any error occurs during the construction of these objects
// that would be unrecoverable anyway and we neither may trig a retry
const documentClient = new DocumentDBClient(cosmosDbUri, {
  masterKey: cosmosDbKey
});

const messageStatusModel = new MessageStatusModel(
  documentClient,
  messageStatusCollectionUrl
);

// As we cannot use Functions bindings to do retries,
// we resort to update the message visibility timeout
// using the queue service (client for Azure queue storage)
const queueService = createQueueService(queueConnectionString);

const profileModel = new ProfileModel(documentClient, profilesCollectionUrl);

const messageModel = new MessageModel(
  documentClient,
  messagesCollectionUrl,
  messageContainerName
);

const notificationModel = new NotificationModel(
  documentClient,
  notificationsCollectionUrl
);

const senderServiceModel = new SenderServiceModel(
  documentClient,
  senderServicesCollectionUrl
);

const blobService = createBlobService(storageConnectionString);

const InputBindings = t.partial({
  createdMessage: CreatedMessageEvent
});
type InputBindings = t.TypeOf<typeof InputBindings>;

const OutputBindings = t.partial({
  emailNotification: NotificationEvent,
  webhookNotification: NotificationEvent
});
type OutputBindings = t.TypeOf<typeof OutputBindings>;

/**
 * Input and output bindings for this function
 * see CreatedMessageQueueHandler/function.json
 */
const ContextWithBindings = t.interface({
  bindings: t.intersection([InputBindings, OutputBindings])
});

type ContextWithBindings = t.TypeOf<typeof ContextWithBindings> & Context;

// tslint:disable-next-line: no-let
let logger: Context["log"] | undefined;
const contextTransport = new AzureContextTransport(() => logger, {
  level: "debug"
});
winston.add(contextTransport);

function* handler(context: IFunctionContext): IterableIterator<unknown> {
  logger = context.log;

  // decode input CreatedMessageEvent
  const input = context.df.getInput();
  const errorOrCreatedMessageEvent = CreatedMessageEvent.decode(input);
  if (errorOrCreatedMessageEvent.isLeft()) {
    context.log.error(
      `Invalid CreatedMessageEvent received by orchestrator|ORCHESTRATOR_ID=${
        context.df.instanceId
      }|ERRORS=${ReadableReporter.report(errorOrCreatedMessageEvent).join(
        " / "
      )}`
    );
    // we will never be able to recover from this, so don't trigger a retry
    return [];
  }

  const createdMessageEvent = errorOrCreatedMessageEvent.value;
  const newMessageWithContent = createdMessageEvent.message;

  context.log.verbose(
    `CreatedMessageOrchestrator|CreatedMessageEvent received|ORCHESTRATOR_ID=${context.df.instanceId}|MESSAGE_ID=${newMessageWithContent.id}|RECIPIENT=${newMessageWithContent.fiscalCode}`
  );

  const messageStatusUpdater = getMessageStatusUpdater(
    messageStatusModel,
    newMessageWithContent.id
  );

  const eventName = "handler.message.process";

  const appInsightsClient = getCustomTelemetryClient(
    {
      operationId: newMessageWithContent.id,
      operationParentId: newMessageWithContent.id,
      serviceId: NonEmptyString.is(newMessageWithContent.senderServiceId)
        ? newMessageWithContent.senderServiceId
        : undefined
    },
    {
      messageId: newMessageWithContent.id
    }
  );

  // now we can trigger the notifications for the message
  handleMessage(
    profileModel,
    messageModel,
    notificationModel,
    senderServiceModel,
    blobService,
    defaultWebhookUrl,
    createdMessageEvent
  );

  return [];
}

const orchestrator = df.orchestrator(handler);

export default orchestrator;
