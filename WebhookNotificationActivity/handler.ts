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
} from "io-functions-commons/dist/src/models/notification";
import { NotificationEvent } from "io-functions-commons/dist/src/models/notification_event";

import {
  isTransientError,
  PermanentError,
  RuntimeError,
  TransientError
} from "io-functions-commons/dist/src/utils/errors";

import { CreatedMessageEventSenderMetadata } from "io-functions-commons/dist/src/models/created_message_sender_metadata";
import {
  ActiveMessage,
  NewMessageWithoutContent
} from "io-functions-commons/dist/src/models/message";

import { HttpsUrl } from "io-functions-commons/dist/generated/definitions/HttpsUrl";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import { SenderMetadata } from "io-functions-commons/dist/generated/definitions/SenderMetadata";

import { fromEither, TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
import {
  TypeofApiCall,
  TypeofApiResponse
} from "italia-ts-commons/lib/requests";
import { Notification } from "../generated/notifications/Notification";
import { WebhookNotifyT } from "./client";

export const WebhookNotificationActivityInput = t.interface({
  notificationEvent: NotificationEvent
});

export type WebhookNotificationActivityInput = t.TypeOf<
  typeof WebhookNotificationActivityInput
>;

export const WebhookNotificationActivityResult = t.taggedUnion("kind", [
  t.interface({
    kind: t.literal("SUCCESS"),
    result: t.keyof({ OK: null, EXPIRED: null })
  }),
  t.interface({
    kind: t.literal("FAILURE"),
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
function newMessageToPublic(
  newMessage: NewMessageWithoutContent,
  content?: MessageContent
): Notification["message"] {
  const message = {
    created_at: newMessage.createdAt,
    fiscal_code: newMessage.fiscalCode,
    id: newMessage.id,
    sender_service_id: newMessage.senderServiceId
  };
  return content ? { ...message, content } : message;
}

/**
 * Convert the internal representation of sender metadata
 * to the one of the public API
 */
function senderMetadataToPublic(
  senderMetadata: CreatedMessageEventSenderMetadata
): SenderMetadata {
  return {
    department_name: senderMetadata.departmentName,
    organization_name: senderMetadata.organizationName,
    service_name: senderMetadata.serviceName
  };
}

/**
 * Post data to the API proxy webhook endpoint.
 */
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
          sender_metadata: senderMetadataToPublic(senderMetadata)
        },
        webhookEndpoint
      }),
    err =>
      // tslint:disable-next-line: no-any
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
  const errorOrMaybeNotification = await lNotificationModel.find(
    notificationId,
    message.id
  );

  if (errorOrMaybeNotification.isLeft()) {
    const error = errorOrMaybeNotification.value;
    // we got an error while fetching the notification
    context.log.warn(`${logPrefix}|ERROR=${error.body}`);
    throw new Error(`Error while fetching the notification: ${error.body}`);
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
      throw new Error("Error while calling webhook");
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
