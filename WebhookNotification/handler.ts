/*
 * This function will process events triggered by newly created messages.
 *
 * For each new input message, retrieve the URL associated to the webhook
 * from the payload then send an HTTP request to the API Proxy
 * which in turns delivers the message to the mobile App.
 */

import { HttpsUrl } from "@pagopa/io-functions-commons/dist/generated/definitions/HttpsUrl";
import {
  ActiveMessage,
  NewMessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  NotificationModel,
  WebhookNotification
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import {
  PermanentError,
  RuntimeError,
  TransientError,
  isTransientError
} from "@pagopa/io-functions-commons/dist/src/utils/errors";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import {
  TypeofApiCall,
  TypeofApiResponse
} from "@pagopa/ts-commons/lib/requests";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { flow, pipe } from "fp-ts/lib/function";
import * as t from "io-ts";

import {
  CommonMessageData,
  NotificationCreatedEvent
} from "../utils/events/message";
import { withDecodedInput } from "../utils/with-decoded-input";
import { DataFetcher, withExpandedInput } from "../utils/with-expanded-input";
import { withJsonInput } from "../utils/with-json-input";
import { WebhookNotifyT } from "./client";

export const WebhookNotificationInput = NotificationCreatedEvent;

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
 * Post data to the API proxy webhook endpoint.
 */
export const sendToWebhook = (
  notifyApiCall: TypeofApiCall<WebhookNotifyT>,
  webhookEndpoint: HttpsUrl,
  message: NewMessageWithoutContent
): TaskEither<RuntimeError, TypeofApiResponse<WebhookNotifyT>> =>
  pipe(
    TE.tryCatch(
      () =>
        notifyApiCall({
          fiscal_code: message.fiscalCode,
          notification_type: "MESSAGE",
          message_id: message.id,
          webhookEndpoint
        }),
      (err) =>
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
          (errs) =>
            E.left(
              PermanentError(
                `Decoding error calling webhook: ${readableReport(errs)}`
              )
            ),
          (r) =>
            r.status === 204
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
  retrieveProcessingMessageData: DataFetcher<CommonMessageData>
) =>
  withJsonInput(
    withDecodedInput(
      WebhookNotificationInput,
      withExpandedInput(
        "messageId",
        retrieveProcessingMessageData,
        async (context, { message, notificationId }) => {
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
            throw new Error(
              `Error while fetching the notification: ${error.kind}`
            );
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
            message
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
        }
      )
    )
  );
