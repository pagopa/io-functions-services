/*
 * This function will process events triggered by newly created messages.
 *
 * For each new input message, retrieve the URL associated to the webhook
 * from the payload then send an HTTP request to the API Proxy
 * which in turns delivers the message to the mobile App.
 */

import * as t from "io-ts";

import * as request from "superagent";

import { Either, left, right } from "fp-ts/lib/Either";

import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { UrlFromString } from "italia-ts-commons/lib/url";

import { Context } from "@azure/functions";

import {
  NotificationModel,
  WebhookNotification
} from "io-functions-commons/dist/src/models/notification";
import { NotificationEvent } from "io-functions-commons/dist/src/models/notification_event";

import {
  PermanentError,
  RuntimeError,
  TransientError
} from "io-functions-commons/dist/src/utils/errors";

import { CreatedMessageEventSenderMetadata } from "io-functions-commons/dist/src/models/created_message_sender_metadata";
import {
  ActiveMessage,
  NewMessageWithoutContent
} from "io-functions-commons/dist/src/models/message";

import {
  diffInMilliseconds,
  wrapCustomTelemetryClient
} from "io-functions-commons/dist/src/utils/application_insights";

import { CreatedMessageWithContent } from "io-functions-commons/dist/generated/definitions/CreatedMessageWithContent";
import { HttpsUrl } from "io-functions-commons/dist/generated/definitions/HttpsUrl";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import { SenderMetadata } from "io-functions-commons/dist/generated/definitions/SenderMetadata";

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
    reason: t.keyof({ DECODE_ERROR: null })
  })
]);

export type WebhookNotificationActivityResult = t.TypeOf<
  typeof WebhookNotificationActivityResult
>;

// request timeout in milliseconds
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

/**
 * Convert the internal representation of the message
 * to the one of the public API
 */
function newMessageToPublic(
  newMessage: NewMessageWithoutContent,
  content: MessageContent
): CreatedMessageWithContent {
  return {
    content,
    created_at: newMessage.createdAt,
    fiscal_code: newMessage.fiscalCode,
    id: newMessage.id,
    sender_service_id: newMessage.senderServiceId
  };
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
export async function sendToWebhook(
  webhookEndpoint: HttpsUrl,
  message: NewMessageWithoutContent,
  content: MessageContent,
  senderMetadata: CreatedMessageEventSenderMetadata
): Promise<Either<RuntimeError, request.Response>> {
  try {
    const response = await request("POST", webhookEndpoint)
      .timeout(DEFAULT_REQUEST_TIMEOUT_MS)
      .set("Content-Type", "application/json")
      .accept("application/json")
      .send({
        message: newMessageToPublic(message, content),
        sender_metadata: senderMetadataToPublic(senderMetadata)
      });

    if (response.error) {
      return left<RuntimeError, request.Response>(
        // in case of server HTTP 5xx errors we trigger a retry
        response.serverError
          ? TransientError(
              `Transient HTTP error calling API Proxy: ${response.text}`
            )
          : PermanentError(
              `Permanent HTTP error calling API Proxy: ${response.text}`
            )
      );
    }
    return right<RuntimeError, request.Response>(response);
  } catch (err) {
    const errorMsg =
      err.response && err.response.text ? err.response.text : "unknown error";
    return left<RuntimeError, request.Response>(
      err.timeout
        ? TransientError(`Timeout calling API Proxy`)
        : // when the server returns an HTTP 5xx error
        err.status && err.status % 500 < 100
        ? TransientError(`Transient error calling API proxy: ${errorMsg}`)
        : // when the server returns some other type of HTTP error
          PermanentError(`Permanent error calling API Proxy: ${errorMsg}`)
    );
  }
}

/**
 * Returns a function for handling WebhookNotificationActivity
 */
export const getWebhookNotificationActivityHandler = (
  getCustomTelemetryClient: ReturnType<typeof wrapCustomTelemetryClient>,
  lNotificationModel: NotificationModel
) => async (context: Context, input: unknown): Promise<unknown> => {
  const inputOrError = WebhookNotificationActivityInput.decode(input);

  if (inputOrError.isLeft()) {
    context.log.error(
      `WebhookNotificationActivity|Cannot decode input|ERROR=${readableReport(
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

  const serviceId = message.senderServiceId;

  const eventName = "notification.webhook.delivery";

  const appInsightsClient = getCustomTelemetryClient(
    {
      operationId: notificationId,
      operationParentId: message.id,
      serviceId: NonEmptyString.is(serviceId) ? serviceId : undefined
    },
    {
      messageId: message.id,
      notificationId
    }
  );

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
    context.log.error(`${logPrefix}|ERROR=${error}`);
    return WebhookNotificationActivityResult.encode({
      kind: "FAILURE",
      reason: "DECODE_ERROR"
    });
  }

  const webhookNotification = errorOrWebhookNotification.value.channels.WEBHOOK;

  const startWebhookCallTime = process.hrtime();

  const sendResult = await sendToWebhook(
    webhookNotification.url,
    message,
    content,
    senderMetadata
  );

  const webhookCallDurationMs = diffInMilliseconds(startWebhookCallTime);

  // hide backend secret token in logs
  const hostName = UrlFromString.decode(webhookNotification.url).fold(
    _ => "invalid url",
    url => url.hostname || "invalid hostname"
  );

  const eventContent = {
    data: hostName,
    dependencyTypeName: "HTTP",
    duration: webhookCallDurationMs,
    name: eventName
  };

  if (sendResult.isLeft()) {
    const error = sendResult.value;
    // track the event of failed delivery
    appInsightsClient.trackDependency({
      ...eventContent,
      properties: {
        error: error.message
      },
      resultCode: error.kind,
      success: false
    });
    context.log.error(`${logPrefix}|ERROR=${error.message}`);
    throw new Error("Error while calling webhook");
  }

  const apiMessageResponse = sendResult.value;

  // track the event of successful delivery
  appInsightsClient.trackDependency({
    ...eventContent,
    resultCode: apiMessageResponse.status,
    success: true
  });

  return WebhookNotificationActivityResult.encode({
    kind: "SUCCESS",
    result: "OK"
  });
};
