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

import { CreatedMessageEvent } from "io-functions-commons/dist/src/models/created_message_event";

import { getStoreMessageContentActivityHandler } from "../StoreMessageContentActivity/handler";
import { getCreateNotificationActivityHandler } from "../CreateNotificationActivity/handler";

function* handler(context: IFunctionContext): IterableIterator<unknown> {
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

  // TODO: customize + backoff
  // see https://docs.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-error-handling#javascript-functions-2x-only-1
  const retryOptions = new df.RetryOptions(5000, 10);

  try {
    const storeMessageContentActivityResult: PromiseType<
      ReturnType<ReturnType<typeof getStoreMessageContentActivityHandler>>
    > = yield context.df.callActivityWithRetry(
      "StoreMessageContentActivity",
      retryOptions,
      createdMessageEvent
    );

    context.log.verbose(
      `CreatedMessageOrchestrator|StoreMessageContentActivity completed|ORCHESTRATOR_ID=${
        context.df.instanceId
      }|MESSAGE_ID=${newMessageWithContent.id}|RESULT=${
        storeMessageContentActivityResult.kind === "SUCCESS"
          ? "SUCCESS"
          : "FAILURE/" + storeMessageContentActivityResult.reason
      }`
    );

    if (storeMessageContentActivityResult.kind !== "SUCCESS") {
      // StoreMessageContentActivity failed permanently, we can't proceed with
      // delivering the notifications
      return [];
    }

    const createNotificationActivityResult: PromiseType<
      ReturnType<ReturnType<typeof getCreateNotificationActivityHandler>>
    > = yield context.df.callActivityWithRetry(
      "CreateNotificationActivity",
      retryOptions,
      {
        createdMessageEvent,
        storeMessageContentActivityResult
      }
    );

    context.log.verbose(
      `createNotificationActivityResult: ${JSON.stringify(
        createNotificationActivityResult
      )}`
    );
  } catch (e) {
    // too many retries
    context.log.error(
      `Fatal error, StoreMessageContentActivity or createNotificationActivity exceeded the max retries|MESSAGE_ID=${createdMessageEvent.message.id}`
    );
  }

  return [];
}

const orchestrator = df.orchestrator(handler);

export default orchestrator;
