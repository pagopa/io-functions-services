/*
 * This function will process events triggered by newly created messages.
 *
 * For each new input message, retrieve the URL associated to the webhook
 * from the payload then send an HTTP request to the API Proxy
 * which in turns delivers the message to the mobile App.
 */

import * as t from "io-ts";

import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";

import { readableReport } from "@pagopa/ts-commons/lib/reporters";

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

import * as TE from "fp-ts/lib/TaskEither";
import {
  TypeofApiCall,
  TypeofApiResponse
} from "@pagopa/ts-commons/lib/requests";
import { flow, pipe } from "fp-ts/lib/function";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { Notification } from "../generated/notifications/Notification";
import { withJsonInput } from "../utils/with-json-input";
import { WebhookNotifyT } from "./client";

export const WebhookNotificationInput = t.interface({
  notificationEvent: NotificationEvent
});

export type WebhookNotificationInput = t.TypeOf<
  typeof WebhookNotificationInput
>;

export const WebhookNotificationResult = t.taggedUnion("kind", [
  t.interface({
    kind: t.literal("SUCCESS"),
    // eslint-disable-next-line sort-keys
    result: t.keyof({ OK: null, EXPIRED: null })
  }),
  t.interface({
    kind: t.literal("FAILURE"),
    reason: t.keyof({ DECODE_ERROR: null, SEND_TO_WEBHOOK_FAILED: null })
  })
]);

export type WebhookNotificationResult = t.TypeOf<
  typeof WebhookNotificationResult
>;

/**
 * Convert the internal representation of the message
 * to the one of the public NotificationAPI
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function newMessageToPublic(
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
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function senderMetadataToPublic(
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
export const sendToWebhook = (
  notifyApiCall: TypeofApiCall<WebhookNotifyT>,
  webhookEndpoint: HttpsUrl,
  message: NewMessageWithoutContent,
  content: MessageContent,
  senderMetadata: CreatedMessageEventSenderMetadata,
  disableWebhookMessageContent: boolean
  // eslint-disable-next-line max-params
): TaskEither<RuntimeError, TypeofApiResponse<WebhookNotifyT>> =>
  pipe(
    TE.tryCatch(
      () =>
        notifyApiCall({
          notification: {
            // If the service requires secure channels
            // or the message content is disabled for all services
            // we send an empty (generic) push notification
            // generic content is provided by `io-backend` https://github.com/pagopa/io-backend/blob/v7.16.0/src/controllers/notificationController.ts#L62
            message:
              senderMetadata.requireSecureChannels ||
              disableWebhookMessageContent
                ? newMessageToPublic(message)
                : newMessageToPublic(message, content),
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
    ),
    TE.chain(
      flow(
        E.foldW(
          errs =>
            E.left(
              PermanentError(
                `Decoding error calling webhook: ${readableReport(errs)}`
              )
            ),
          r =>
            r.status === 200
              ? E.right(r)
              : r.status === 500
              ? // in case of server HTTP 5xx errors we trigger a retry
                E.left(
                  TransientError(
                    `Transient HTTP error calling webhook: ${r.status}`
                  )
                )
              : E.left(
                  PermanentError(
                    `Permanent HTTP error calling webhook: ${r.status}`
                  )
                )
        ),
        TE.fromEither
      )
    )
  );

/**
 * Returns a function for handling WebhookNotification
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getWebhookNotificationHandler = (
  lNotificationModel: NotificationModel,
  notifyApiCall: TypeofApiCall<WebhookNotifyT>,
  disableWebhookMessageContent: boolean
) =>
  withJsonInput(async (context, input) => {
    const inputOrError = WebhookNotificationInput.decode(input);

    if (E.isLeft(inputOrError)) {
      context.log.error(
        `${context.executionContext.functionName}|Cannot decode input`
      );
      context.log.verbose(
        `${
          context.executionContext.functionName
        }|ERROR_DETAILS=${readableReport(inputOrError.left)}`
      );
      return WebhookNotificationResult.encode({
        kind: "FAILURE",
        reason: "DECODE_ERROR"
      });
    }

    const { notificationEvent } = inputOrError.right;

    const {
      content,
      message,
      notificationId,
      senderMetadata
    } = notificationEvent;

    const logPrefix = `${context.executionContext.functionName}|MESSAGE_ID=${message.id}|NOTIFICATION_ID=${notificationId}`;

    // Check whether the message is expired
    const errorOrActiveMessage = ActiveMessage.decode(message);

    if (E.isLeft(errorOrActiveMessage)) {
      // if the message is expired no more processing is necessary
      context.log.warn(`${logPrefix}|RESULT=TTL_EXPIRED`);
      return WebhookNotificationResult.encode({
        kind: "SUCCESS",
        result: "EXPIRED"
      });
    }

    // fetch the notification
    const errorOrMaybeNotification = await lNotificationModel.find([
      notificationId,
      message.id
    ])();

    if (E.isLeft(errorOrMaybeNotification)) {
      const error = errorOrMaybeNotification.left;
      // we got an error while fetching the notification
      context.log.warn(`${logPrefix}|ERROR=${error.kind}`);
      throw new Error(`Error while fetching the notification: ${error.kind}`);
    }

    const maybeWebhookNotification = errorOrMaybeNotification.right;
    if (O.isNone(maybeWebhookNotification)) {
      // it may happen that the object is not yet visible to this function due to latency
      // as the notification object is retrieved from database and we may be hitting a
      // replica that is not yet in sync - throwing an error will trigger a retry
      context.log.warn(`${logPrefix}|RESULT=NOTIFICATION_NOT_FOUND`);
      throw new Error(`Notification not found`);
    }

    const errorOrWebhookNotification = WebhookNotification.decode(
      maybeWebhookNotification.value
    );

    if (E.isLeft(errorOrWebhookNotification)) {
      // The notification object is not compatible with this code
      const error = readableReport(errorOrWebhookNotification.left);
      context.log.error(`${logPrefix}|ERROR`);
      context.log.verbose(`${logPrefix}|ERROR_DETAILS=${error}`);
      return WebhookNotificationResult.encode({
        kind: "FAILURE",
        reason: "DECODE_ERROR"
      });
    }

    const webhookNotification =
      errorOrWebhookNotification.right.channels.WEBHOOK;

    const sendResult = await sendToWebhook(
      notifyApiCall,
      webhookNotification.url,
      message,
      content,
      senderMetadata,
      disableWebhookMessageContent
    )();
    if (E.isLeft(sendResult)) {
      const error = sendResult.left;
      context.log.error(`${logPrefix}|ERROR=${error.message}`);
      if (isTransientError(error)) {
        throw new Error(`Error while calling webhook: ${error.message}`);
      } else {
        return WebhookNotificationResult.encode({
          kind: "FAILURE",
          reason: "SEND_TO_WEBHOOK_FAILED"
        });
      }
    }

    return WebhookNotificationResult.encode({
      kind: "SUCCESS",
      result: "OK"
    });
  });
