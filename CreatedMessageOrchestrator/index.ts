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

import { readableReport } from "italia-ts-commons/lib/reporters";
import { PromiseType } from "italia-ts-commons/lib/types";

import { NotificationChannelEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannel";
import { NotificationChannelStatusValueEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannelStatusValue";
import { CreatedMessageEvent } from "io-functions-commons/dist/src/models/created_message_event";

import {
  CreateNotificationActivityResult,
  getCreateNotificationActivityHandler
} from "../CreateNotificationActivity/handler";
import { getEmailNotificationActivityHandler } from "../EmailNotificationActivity/handler";
import { NotificationStatusUpdaterActivityInput } from "../NotificationStatusUpdaterActivity/handler";
import { getStoreMessageContentActivityHandler } from "../StoreMessageContentActivity/handler";
import { getWebhookNotificationActivityHandler } from "../WebhookNotificationActivity/handler";

import { NotificationEvent } from "io-functions-commons/dist/src/models/notification_event";
import { HandlerInputType } from "./utils";

/**
 * Durable Functions Orchestrator that handles CreatedMessage events
 *
 * Note that this handler may be executed multiple times for a single job.
 * See https://docs.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-checkpointing-and-replay
 *
 */
// tslint:disable-next-line: cognitive-complexity no-big-function
function* handler(context: IFunctionContext): IterableIterator<unknown> {
  const input = context.df.getInput();

  // decode input CreatedMessageEvent
  const errorOrCreatedMessageEvent = CreatedMessageEvent.decode(input);
  if (errorOrCreatedMessageEvent.isLeft()) {
    context.log.error(
      `CreatedMessageOrchestrator|Invalid CreatedMessageEvent received|ORCHESTRATOR_ID=${
        context.df.instanceId
      }|ERRORS=${readableReport(errorOrCreatedMessageEvent.value)}`
    );
    // we will never be able to recover from this, so don't trigger a retry
    return [];
  }

  const createdMessageEvent = errorOrCreatedMessageEvent.value;
  const newMessageWithContent = createdMessageEvent.message;

  const logPrefix = `CreatedMessageOrchestrator|ORCHESTRATOR_ID=${context.df.instanceId}|MESSAGE_ID=${newMessageWithContent.id}|RECIPIENT=${newMessageWithContent.fiscalCode}`;

  if (!context.df.isReplaying) {
    context.log.verbose(`${logPrefix}|Starting`);
  }

  // TODO: customize + backoff
  // see https://docs.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-error-handling#javascript-functions-2x-only-1
  const retryOptions = new df.RetryOptions(5000, 10);

  try {
    // first we store the content of the message in the database
    const storeMessageContentActivityResult: PromiseType<
      ReturnType<ReturnType<typeof getStoreMessageContentActivityHandler>>
    > = yield context.df.callActivityWithRetry(
      "StoreMessageContentActivity",
      retryOptions,
      // The cast is here for making TypeScript check that we're indeed passing
      // the right parameters
      // tslint:disable-next-line: no-useless-cast
      createdMessageEvent as HandlerInputType<
        ReturnType<typeof getStoreMessageContentActivityHandler>
      >
    );

    if (!context.df.isReplaying) {
      context.log.verbose(
        `${logPrefix}|StoreMessageContentActivity completed|RESULT=${
          storeMessageContentActivityResult.kind === "SUCCESS"
            ? "SUCCESS"
            : "FAILURE/" + storeMessageContentActivityResult.reason
        }`
      );
    }

    if (storeMessageContentActivityResult.kind !== "SUCCESS") {
      // StoreMessageContentActivity failed permanently, we can't proceed with
      // delivering the notifications
      // TODO: messageStatusUpdater(MessageStatusValueEnum.REJECTED); ?

      return [];
    }

    // then we create a NotificationActivity in the database that will store
    // the status of the notification on each channel
    const createNotificationActivityResultJson: PromiseType<
      ReturnType<ReturnType<typeof getCreateNotificationActivityHandler>>
    > = yield context.df.callActivityWithRetry(
      "CreateNotificationActivity",
      retryOptions,
      {
        createdMessageEvent,
        storeMessageContentActivityResult
      } as HandlerInputType<
        ReturnType<typeof getCreateNotificationActivityHandler>
      >
    );

    const createNotificationActivityResultOrError = CreateNotificationActivityResult.decode(
      createNotificationActivityResultJson
    );

    if (createNotificationActivityResultOrError.isLeft()) {
      context.log.error(
        `${logPrefix}|Unable to parse CreateNotificationActivityResult|ERROR=${readableReport(
          createNotificationActivityResultOrError.value
        )}`
      );
      return [];
    }

    const createNotificationActivityResult =
      createNotificationActivityResultOrError.value;

    if (createNotificationActivityResult.kind === "none") {
      // no channel configured, no notifications need to be delivered
      context.log.verbose(`${logPrefix}|No notifications will be delivered`);
      return [];
    }

    // TODO: run all notifications in parallel

    if (createNotificationActivityResult.hasEmail) {
      //
      // Send the email notification
      //
      // We need to catch the exception thrown by callActivityWithRetry when
      // the activity fails too many times.
      try {
        // trigger the EmailNotificationActivity that will send the email
        const emailNotificationActivityResult: PromiseType<
          ReturnType<ReturnType<typeof getEmailNotificationActivityHandler>>
        > = yield context.df.callActivityWithRetry(
          "EmailNotificationActivity",
          retryOptions,
          {
            emailNotificationEventJson: NotificationEvent.encode(
              createNotificationActivityResult.notificationEvent
            )
          } as HandlerInputType<
            ReturnType<typeof getEmailNotificationActivityHandler>
          >
        );

        if (!context.df.isReplaying) {
          context.log.verbose(
            `${logPrefix}|EmailNotificationActivity result: ${JSON.stringify(
              emailNotificationActivityResult
            )}`
          );
        }

        // once the email has been sent, update the notification status
        const emailNotificationStatusUpdaterActivityInput = NotificationStatusUpdaterActivityInput.encode(
          {
            channel: NotificationChannelEnum.EMAIL,
            messageId: createdMessageEvent.message.id,
            notificationId:
              createNotificationActivityResult.notificationEvent.notificationId,
            status: NotificationChannelStatusValueEnum.SENT
          }
        );

        try {
          yield context.df.callActivityWithRetry(
            "NotificationStatusUpdaterActivity",
            retryOptions,
            emailNotificationStatusUpdaterActivityInput
          );
        } catch (e) {
          // Too many failures while updating the notification status.
          // We can't do much about it, we just log it and continue.
          context.log.error(
            `${logPrefix}|NotificationStatusUpdaterActivity failed too many times|CHANNEL=email|ERROR=${e}`
          );
        }
      } catch (e) {
        // Too many failures while sending the email.
        // We can't do much about it, we just log it and continue.
        context.log.error(
          `${logPrefix}|EmailNotificationActivity failed too many times|ERROR=${e}`
        );
      }
    }

    if (createNotificationActivityResult.hasWebhook) {
      //
      // Send the webhook notification
      //
      // We need to catch the exception thrown by callActivityWithRetry when
      // the activity fails too many times.
      try {
        // trigger the EmailNotificationActivity that will send the email
        const webhookNotificationActivityResult: PromiseType<
          ReturnType<ReturnType<typeof getEmailNotificationActivityHandler>>
        > = yield context.df.callActivityWithRetry(
          "WebhookNotificationActivity",
          retryOptions,
          {
            webhookNotificationEventJson: NotificationEvent.encode(
              createNotificationActivityResult.notificationEvent
            )
          } as HandlerInputType<
            ReturnType<typeof getWebhookNotificationActivityHandler>
          >
        );

        if (!context.df.isReplaying) {
          context.log.verbose(
            `${logPrefix}|WebhookNotificationActivity result: ${JSON.stringify(
              webhookNotificationActivityResult
            )}`
          );
        }

        // once the email has been sent, update the notification status
        const webhookNotificationStatusUpdaterActivityInput = NotificationStatusUpdaterActivityInput.encode(
          {
            channel: NotificationChannelEnum.WEBHOOK,
            messageId: createdMessageEvent.message.id,
            notificationId:
              createNotificationActivityResult.notificationEvent.notificationId,
            status: NotificationChannelStatusValueEnum.SENT
          }
        );

        try {
          yield context.df.callActivityWithRetry(
            "NotificationStatusUpdaterActivity",
            retryOptions,
            webhookNotificationStatusUpdaterActivityInput
          );
        } catch (e) {
          // Too many failures while updating the notification status.
          // We can't do much about it, we just log it and continue.
          context.log.error(
            `${logPrefix}|NotificationStatusUpdaterActivity failed too many times|CHANNEL=webhook|ERROR=${e}`
          );
        }
      } catch (e) {
        // Too many failures while sending the email.
        // We can't do much about it, we just log it and continue.
        context.log.error(
          `${logPrefix}|WebhookNotificationActivity failed too many times|ERROR=${e}`
        );
      }
    }

    // TODO: messageStatusUpdater(MessageStatusValueEnum.PROCESSED);
  } catch (e) {
    // FIXME: no exceptions reach this point?
    // too many retries
    context.log.error(
      `CreatedMessageOrchestrator|Fatal error, StoreMessageContentActivity or CreateNotificationActivity exceeded the max retries|MESSAGE_ID=${createdMessageEvent.message.id}|ERROR=${e}`
    );
    // TODO: messageStatusUpdater(MessageStatusValueEnum.FAILED);
  }

  return [];
}

const orchestrator = df.orchestrator(handler);

export default orchestrator;
