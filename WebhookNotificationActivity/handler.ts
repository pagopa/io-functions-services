/*
 * This function will process events triggered by newly created messages.
 *
 * For each new input message, retrieve the URL associated to the webhook
 * from the payload then send an HTTP request to the API Proxy
 * which in turns delivers the message to the mobile App.
 */

import * as t from "io-ts";

import { Either, left, right } from "fp-ts/lib/Either";

import { readableReport } from "italia-ts-commons/lib/reporters";

import { Context } from "@azure/functions";

import {
  NotificationModel,
  WebhookNotification
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import { NotificationEvent } from "@pagopa/io-functions-commons/dist/src/models/notification_event";

import {
  isTransientError,
  PermanentError,
  RuntimeError,
  TransientError
} from "@pagopa/io-functions-commons/dist/src/utils/errors";

import { CreatedMessageEventSenderMetadata } from "@pagopa/io-functions-commons/dist/src/models/created_message_sender_metadata";
import {
  ActiveMessage,
  NewMessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";

import { HttpsUrl } from "@pagopa/io-functions-commons/dist/generated/definitions/HttpsUrl";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { SenderMetadata } from "@pagopa/io-functions-commons/dist/generated/definitions/SenderMetadata";

import { fromEither, TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
import {
  TypeofApiCall,
  TypeofApiResponse
} from "italia-ts-commons/lib/requests";
import { Notification } from "../generated/notifications/Notification";
import { WebhookNotifyT } from "./client";

// eslint-disable-next-line @typescript-eslint/naming-convention
export const WebhookNotificationActivityInput = t.interface({
  notificationEvent: NotificationEvent
});

export type WebhookNotificationActivityInput = t.TypeOf<
  typeof WebhookNotificationActivityInput
>;

// eslint-disable-next-line @typescript-eslint/naming-convention
export const WebhookNotificationActivityResult = t.taggedUnion("kind", [
  t.interface({
    kind: t.literal("SUCCESS"),
    // eslint-disable-next-line sort-keys
    result: t.keyof({ OK: null, EXPIRED: null })
  }),
  t.interface({
    kind: t.literal("FAILURE"),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    reason: t.keyof({ DECODE_ERROR: null, SEND_TO_WEBHOOK_FAILED: null })
  })
]);

export type WebhookNotificationActivityResult = t.TypeOf<
  typeof WebhookNotificationActivityResult
>;

/**
 * Convert the internal representation of the message
 * to the one of the public NotificationAPI
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function newMessageToPublic(
  newMessage: NewMessageWithoutContent,
  content?: MessageContent
): Notification["message"] {
  const message = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    created_at: newMessage.createdAt,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    fiscal_code: newMessage.fiscalCode,
    id: newMessage.id,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    sender_service_id: newMessage.senderServiceId
  };
  return content ? { ...message, content } : message;
}

/**
 * Convert the internal representation of sender metadata
 * to the one of the public API
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function senderMetadataToPublic(
  senderMetadata: CreatedMessageEventSenderMetadata
): SenderMetadata {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    department_name: senderMetadata.departmentName,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    organization_name: senderMetadata.organizationName,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    service_name: senderMetadata.serviceName
  };
}

/**
 * Post data to the API proxy webhook endpoint.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function sendToWebhook(
  notifyApiCall: TypeofApiCall<WebhookNotifyT>,
  webhookEndpoint: HttpsUrl,
  message: NewMessageWithoutContent,
  content: MessageContent,
  senderMetadata: CreatedMessageEventSenderMetadata
): TaskEither<RuntimeError, TypeofApiResponse<WebhookNotifyT>> {
  return tryCatch(
    () =>
      notifyApiCall({
        notification: {
          // if the service requires secure channels
          // we send an empty (generic) push notification
          message: senderMetadata.requireSecureChannels
            ? newMessageToPublic(message)
            : newMessageToPublic(message, content),
          // eslint-disable-next-line @typescript-eslint/naming-convention
          sender_metadata: senderMetadataToPublic(senderMetadata)
        },
        webhookEndpoint
      }),
    err =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err as any).name === "AbortError"
        ? (TransientError(`Timeout calling webhook: ${err}`) as RuntimeError)
        : (PermanentError(
            `Unexpected exception raised calling webhook: ${err}`
          ) as RuntimeError)
  ).chain(response =>
    fromEither(
      response.fold<Either<RuntimeError, TypeofApiResponse<WebhookNotifyT>>>(
        errs =>
          left(
            PermanentError(
              `Decoding error calling webhook: ${readableReport(errs)}`
            )
          ),
        r =>
          r.status === 200
            ? right(r)
            : r.status === 500
            ? // in case of server HTTP 5xx errors we trigger a retry
              left(
                TransientError(
                  `Transient HTTP error calling webhook: ${r.status}`
                )
              )
            : left(
                PermanentError(
                  `Permanent HTTP error calling webhook: ${r.status}`
                )
              )
      )
    )
  );
}

/**
 * Returns a function for handling WebhookNotificationActivity
 */
export const getWebhookNotificationActivityHandler = (
  lNotificationModel: NotificationModel,
  notifyApiCall: TypeofApiCall<WebhookNotifyT>
) => async (context: Context, input: unknown): Promise<unknown> => {
  const inputOrError = WebhookNotificationActivityInput.decode(input);

  if (inputOrError.isLeft()) {
    context.log.error(`WebhookNotificationActivity|Cannot decode input`);
    context.log.verbose(
      `WebhookNotificationActivity|ERROR_DETAILS=${readableReport(
        inputOrError.value
      )}`
    );
    return WebhookNotificationActivityResult.encode({
      kind: "FAILURE",
      reason: "DECODE_ERROR"
    });
  }

  const { notificationEvent } = inputOrError.value;

  const {
    content,
    message,
    notificationId,
    senderMetadata
  } = notificationEvent;

  const logPrefix = `WebhookNotificationActivity|MESSAGE_ID=${message.id}|RECIPIENT=${message.fiscalCode}|NOTIFICATION_ID=${notificationId}`;

  // Check whether the message is expired
  const errorOrActiveMessage = ActiveMessage.decode(message);

  if (errorOrActiveMessage.isLeft()) {
    // if the message is expired no more processing is necessary
    context.log.warn(`${logPrefix}|RESULT=TTL_EXPIRED`);
    return WebhookNotificationActivityResult.encode({
      kind: "SUCCESS",
      result: "EXPIRED"
    });
  }

  // fetch the notification
  const errorOrMaybeNotification = await lNotificationModel
    .find([notificationId, message.id])
    .run();

  if (errorOrMaybeNotification.isLeft()) {
    const error = errorOrMaybeNotification.value;
    // we got an error while fetching the notification
    context.log.warn(`${logPrefix}|ERROR=${error.kind}`);
    throw new Error(`Error while fetching the notification: ${error.kind}`);
  }

  const maybeWebhookNotification = errorOrMaybeNotification.value;
  if (maybeWebhookNotification.isNone()) {
    // it may happen that the object is not yet visible to this function due to latency
    // as the notification object is retrieved from database and we may be hitting a
    // replica that is not yet in sync - throwing an error will trigger a retry
    context.log.warn(`${logPrefix}|RESULT=NOTIFICATION_NOT_FOUND`);
    throw new Error(`Notification not found`);
  }

  const errorOrWebhookNotification = WebhookNotification.decode(
    maybeWebhookNotification.value
  );

  if (errorOrWebhookNotification.isLeft()) {
    // The notification object is not compatible with this code
    const error = readableReport(errorOrWebhookNotification.value);
    context.log.error(`${logPrefix}|ERROR`);
    context.log.verbose(`${logPrefix}|ERROR_DETAILS=${error}`);
    return WebhookNotificationActivityResult.encode({
      kind: "FAILURE",
      reason: "DECODE_ERROR"
    });
  }

  const webhookNotification = errorOrWebhookNotification.value.channels.WEBHOOK;

  const sendResult = await sendToWebhook(
    notifyApiCall,
    webhookNotification.url,
    message,
    content,
    senderMetadata
  ).run();
  if (sendResult.isLeft()) {
    const error = sendResult.value;
    context.log.error(`${logPrefix}|ERROR=${error.message}`);
    if (isTransientError(error)) {
      throw new Error(`Error while calling webhook: ${error.message}`);
    } else {
      return WebhookNotificationActivityResult.encode({
        kind: "FAILURE",
        reason: "SEND_TO_WEBHOOK_FAILED"
      });
    }
  }

  return WebhookNotificationActivityResult.encode({
    kind: "SUCCESS",
    result: "OK"
  });
};
