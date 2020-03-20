import * as df from "durable-functions";
import { IFunctionContext } from "durable-functions/lib/src/classes";

import { readableReport } from "italia-ts-commons/lib/reporters";

import { NotificationChannelEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannel";
import { NotificationChannelStatusValueEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannelStatusValue";
import { CreatedMessageEvent } from "io-functions-commons/dist/src/models/created_message_event";

import { MessageStatusValueEnum } from "io-functions-commons/dist/generated/definitions/MessageStatusValue";
import {
  CreateNotificationActivityInput,
  CreateNotificationActivityResult
} from "../CreateNotificationActivity/handler";
import {
  EmailNotificationActivityInput,
  EmailNotificationActivityResult
} from "../EmailNotificationActivity/handler";
import { Input as MessageStatusUpdaterActivityInput } from "../MessageStatusUpdaterActivity/handler";
import { NotificationStatusUpdaterActivityInput } from "../NotificationStatusUpdaterActivity/handler";
import { StoreMessageContentActivityResult } from "../StoreMessageContentActivity/handler";
import {
  WebhookNotificationActivityInput,
  WebhookNotificationActivityResult
} from "../WebhookNotificationActivity/handler";

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
      `CreatedMessageOrchestrator|ORCHESTRATOR_ID=${context.df.instanceId}|ERROR=DECODE_ERROR`
    );
    context.log.verbose(
      `CreatedMessageOrchestrator|ERROR_DETAILS=${readableReport(
        errorOrCreatedMessageEvent.value
      )}`
    );
    // we will never be able to recover from this, so don't trigger a retry
    return [];
  }

  const createdMessageEvent = errorOrCreatedMessageEvent.value;
  const newMessageWithContent = createdMessageEvent.message;

  const logPrefix = `CreatedMessageOrchestrator|ORCHESTRATOR_ID=${context.df.instanceId}|MESSAGE_ID=${newMessageWithContent.id}|RECIPIENT=${newMessageWithContent.fiscalCode}`;

  context.log.verbose(`${logPrefix}|Starting`);

  // TODO: customize + backoff
  // see https://docs.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-error-handling#javascript-functions-2x-only-1
  const retryOptions = new df.RetryOptions(5000, 10);

  try {
    // first we store the content of the message in the database
    const storeMessageContentActivityResultJson = yield context.df.callActivityWithRetry(
      "StoreMessageContentActivity",
      retryOptions,
      CreatedMessageEvent.encode(createdMessageEvent)
    );

    const storeMessageContentActivityResultOrError = StoreMessageContentActivityResult.decode(
      storeMessageContentActivityResultJson
    );

    if (storeMessageContentActivityResultOrError.isLeft()) {
      context.log.error(`${logPrefix}|ERROR=DECODE_ERROR`);
      context.log.verbose(
        `${logPrefix}|ERROR_DETAILS=${readableReport(
          storeMessageContentActivityResultOrError.value
        )}`
      );
      // we will never be able to recover from this, so don't trigger a retry
      return [];
    }

    const storeMessageContentActivityResult =
      storeMessageContentActivityResultOrError.value;

    context.log.verbose(
      `${logPrefix}|StoreMessageContentActivity completed|RESULT=${storeMessageContentActivityResult.kind}` +
        (storeMessageContentActivityResult.kind === "FAILURE"
          ? String(storeMessageContentActivityResult.reason)
          : "")
    );

    if (storeMessageContentActivityResult.kind !== "SUCCESS") {
      // StoreMessageContentActivity failed permanently, we can't proceed with
      // delivering the notifications

      // Update message status
      const messageStatusUpdaterActivityInputRejected = MessageStatusUpdaterActivityInput.encode(
        {
          messageId: newMessageWithContent.id,
          status: MessageStatusValueEnum.REJECTED
        }
      );

      // TODO: Do we need to do something is this fails?
      yield context.df.callActivityWithRetry(
        "MessageStatusUpdaterActivity",
        retryOptions,
        messageStatusUpdaterActivityInputRejected
      );

      return [];
    }

    // then we create a NotificationActivity in the database that will store
    // the status of the notification on each channel
    const createNotificationActivityResultJson = yield context.df.callActivityWithRetry(
      "CreateNotificationActivity",
      retryOptions,
      CreateNotificationActivityInput.encode({
        createdMessageEvent,
        storeMessageContentActivityResult
      })
    );

    const createNotificationActivityResultOrError = CreateNotificationActivityResult.decode(
      createNotificationActivityResultJson
    );

    if (createNotificationActivityResultOrError.isLeft()) {
      context.log.error(`${logPrefix}|ERROR=DECODE_ERROR`);
      context.log.verbose(
        `${logPrefix}|ERROR_DETAILS=${readableReport(
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
        const emailNotificationActivityResultJson = yield context.df.callActivityWithRetry(
          "EmailNotificationActivity",
          retryOptions,
          EmailNotificationActivityInput.encode({
            notificationEvent:
              createNotificationActivityResult.notificationEvent
          })
        );

        const emailNotificationActivityResultOrError = EmailNotificationActivityResult.decode(
          emailNotificationActivityResultJson
        );

        if (emailNotificationActivityResultOrError.isLeft()) {
          context.log.error(
            `${logPrefix}|ERROR=DECODE_ERROR|DETAILS=${readableReport(
              emailNotificationActivityResultOrError.value
            )}`
          );
          // not that the activity may have succeeded but we cannot decode its
          // result, so we can't even update the notification status
        } else {
          const emailNotificationActivityResult =
            emailNotificationActivityResultOrError.value;

          if (emailNotificationActivityResult.kind === "FAILURE") {
            context.log.error(
              `${logPrefix}|EmailNotificationActivity failed|REASON=${emailNotificationActivityResult.reason}`
            );
          } else {
            // once the email has been sent, update the notification status
            const emailNotificationStatusUpdaterActivityInput = {
              channel: NotificationChannelEnum.EMAIL,
              messageId: createdMessageEvent.message.id,
              notificationId:
                createNotificationActivityResult.notificationEvent
                  .notificationId,
              status: NotificationChannelStatusValueEnum.SENT
            };

            try {
              yield context.df.callActivityWithRetry(
                "NotificationStatusUpdaterActivity",
                retryOptions,
                NotificationStatusUpdaterActivityInput.encode(
                  emailNotificationStatusUpdaterActivityInput
                )
              );
            } catch (e) {
              // Too many failures while updating the notification status.
              // We can't do much about it, we just log it and continue.
              context.log.error(
                `${logPrefix}|NotificationStatusUpdaterActivity failed too many times|CHANNEL=email|ERROR=${e}`
              );
            }
          }
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
        const webhookNotificationActivityResultJson = yield context.df.callActivityWithRetry(
          "WebhookNotificationActivity",
          retryOptions,
          WebhookNotificationActivityInput.encode({
            notificationEvent:
              createNotificationActivityResult.notificationEvent
          })
        );

        const webhookNotificationActivityResultOrError = WebhookNotificationActivityResult.decode(
          webhookNotificationActivityResultJson
        );

        if (webhookNotificationActivityResultOrError.isLeft()) {
          context.log.error(
            `${logPrefix}|ERROR=DECODE_ERROR|DETAILS=${readableReport(
              webhookNotificationActivityResultOrError.value
            )}`
          );
          // not that the activity may have succeeded but we cannot decode its
          // result, so we can't even update the notification status
        } else {
          const webhookNotificationActivityResult =
            webhookNotificationActivityResultOrError.value;

          if (webhookNotificationActivityResult.kind === "FAILURE") {
            context.log.error(
              `${logPrefix}|webhookNotificationActivity failed|REASON=${webhookNotificationActivityResult.reason}`
            );
          } else {
            // once the email has been sent, update the notification status
            const webhookNotificationStatusUpdaterActivityInput = {
              channel: NotificationChannelEnum.WEBHOOK,
              messageId: createdMessageEvent.message.id,
              notificationId:
                createNotificationActivityResult.notificationEvent
                  .notificationId,
              status: NotificationChannelStatusValueEnum.SENT
            };

            try {
              yield context.df.callActivityWithRetry(
                "NotificationStatusUpdaterActivity",
                retryOptions,
                NotificationStatusUpdaterActivityInput.encode(
                  webhookNotificationStatusUpdaterActivityInput
                )
              );
            } catch (e) {
              // Too many failures while updating the notification status.
              // We can't do much about it, we just log it and continue.
              context.log.error(
                `${logPrefix}|NotificationStatusUpdaterActivity failed too many times|CHANNEL=webhook|ERROR=${e}`
              );
            }
          }
        }
      } catch (e) {
        // Too many failures while sending the email.
        // We can't do much about it, we just log it and continue.
        context.log.error(
          `${logPrefix}|WebhookNotificationActivity failed too many times|ERROR=${e}`
        );
      }
    }

    // Update the message status
    const messageStatusUpdaterActivityInputProcessed = MessageStatusUpdaterActivityInput.encode(
      {
        messageId: newMessageWithContent.id,
        status: MessageStatusValueEnum.PROCESSED
      }
    );

    // TODO: Do we need to do something is this fails?
    yield context.df.callActivityWithRetry(
      "MessageStatusUpdaterActivity",
      retryOptions,
      messageStatusUpdaterActivityInputProcessed
    );
  } catch (e) {
    // FIXME: no exceptions reach this point?
    // too many retries
    context.log.error(
      `CreatedMessageOrchestrator|Fatal error, StoreMessageContentActivity or CreateNotificationActivity exceeded the max retries|MESSAGE_ID=${createdMessageEvent.message.id}|ERROR=${e}`
    );
    // Update the message status
    const messageStatusUpdaterActivityInputFailed = MessageStatusUpdaterActivityInput.encode(
      {
        messageId: newMessageWithContent.id,
        status: MessageStatusValueEnum.FAILED
      }
    );

    // TODO: Do we need to do something is this fails?
    yield context.df.callActivityWithRetry(
      "MessageStatusUpdaterActivity",
      retryOptions,
      messageStatusUpdaterActivityInputFailed
    );
  }

  return [];
}

const orchestrator = df.orchestrator(handler);

export default orchestrator;
