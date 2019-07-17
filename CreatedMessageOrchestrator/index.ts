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
import { PromiseType } from "italia-ts-commons/lib/types";

import { NotificationChannelEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannel";
import { NotificationChannelStatusValueEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannelStatusValue";
import { CreatedMessageEvent } from "io-functions-commons/dist/src/models/created_message_event";

import { getCreateNotificationActivityHandler } from "../CreateNotificationActivity/handler";
import { getEmailNotificationActivityHandler } from "../EmailNotificationActivity/handler";
import { NotificationStatusUpdaterActivityInput } from "../NotificationStatusUpdaterActivity/handler";
import { getStoreMessageContentActivityHandler } from "../StoreMessageContentActivity/handler";

import { HandlerInputType } from "./utils";

/**
 * Durable Functions Orchestrator that handles CreatedMessage events
 *
 * Note that this handler may be executed multiple times for a single job.
 * See https://docs.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-checkpointing-and-replay
 *
 */
function* handler(context: IFunctionContext): IterableIterator<unknown> {
  const input = context.df.getInput();

  // decode input CreatedMessageEvent
  const errorOrCreatedMessageEvent = CreatedMessageEvent.decode(input);
  if (errorOrCreatedMessageEvent.isLeft()) {
    context.log.error(
      `CreatedMessageOrchestrator|Invalid CreatedMessageEvent received|ORCHESTRATOR_ID=${
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

  if (!context.df.isReplaying) {
    context.log.verbose(
      `CreatedMessageOrchestrator|CreatedMessageEvent received|ORCHESTRATOR_ID=${context.df.instanceId}|MESSAGE_ID=${newMessageWithContent.id}|RECIPIENT=${newMessageWithContent.fiscalCode}`
    );
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
        `CreatedMessageOrchestrator|StoreMessageContentActivity completed|ORCHESTRATOR_ID=${
          context.df.instanceId
        }|MESSAGE_ID=${newMessageWithContent.id}|RESULT=${
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
    const createNotificationActivityResult: PromiseType<
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

    if (createNotificationActivityResult.kind === "none") {
      // no channel configured, no notifications need to be delivered
      context.log.verbose(
        `CreatedMessageOrchestrator|No notifications will be delivered|MESSAGE_ID=${newMessageWithContent.id}`
      );
      return [];
    }

    // TODO: run all notifications in parallel

    if (createNotificationActivityResult.hasEmail) {
      // send the email notification
      try {
        const emailNotificationActivityResult: PromiseType<
          ReturnType<ReturnType<typeof getEmailNotificationActivityHandler>>
        > = yield context.df.callActivityWithRetry(
          "EmailNotificationActivity",
          retryOptions,
          {
            emailNotificationEventJson:
              createNotificationActivityResult.notificationEvent
          } as HandlerInputType<
            ReturnType<typeof getEmailNotificationActivityHandler>
          >
        );

        if (!context.df.isReplaying) {
          context.log.verbose(
            `CreatedMessageOrchestrator|EmailNotificationActivity result: ${JSON.stringify(
              emailNotificationActivityResult
            )}`
          );
        }

        // update the notification status
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
          // too many failures
          context.log.error(
            `CreatedMessageOrchestrator|NotificationStatusUpdaterActivity failed too many times|MESSAGE_ID=${createdMessageEvent.message.id}|CHANNEL=email|ERROR=${e}`
          );
        }

        // TODO: add webhook channel
      } catch (e) {
        // too many failures
        context.log.error(
          `CreatedMessageOrchestrator|EmailNotificationActivity failed too many times|MESSAGE_ID=${createdMessageEvent.message.id}|ERROR=${e}`
        );
      }
    }

    // TODO: messageStatusUpdater(MessageStatusValueEnum.PROCESSED);
  } catch (e) {
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
