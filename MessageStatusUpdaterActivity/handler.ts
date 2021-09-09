import { Context } from "@azure/functions";

import * as t from "io-ts";
import * as E from "fp-ts/lib/Either";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import { MessageStatusValue } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusValue";
import {
  getMessageStatusUpdater,
  MessageStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { ReadableReporter } from "@pagopa/ts-commons/lib/reporters";

export const Input = t.interface({
  messageId: NonEmptyString,
  status: MessageStatusValue
});

interface IResponse {
  readonly kind: "FAILURE" | "SUCCESS";
}

export const getMessageStatusUpdaterActivityHandler = (
  messageStatusModel: MessageStatusModel
) => async (context: Context, input: unknown): Promise<IResponse> => {
  const decodedInput = Input.decode(input);
  if (E.isLeft(decodedInput)) {
    context.log.error(
      `MessageStatusUpdaterActivity|ERROR=${ReadableReporter.report(
        decodedInput
      ).join(" / ")}`
    );
    return { kind: "FAILURE" };
  }

  const { messageId, status } = decodedInput.right;

  const result = await getMessageStatusUpdater(
    messageStatusModel,
    messageId
  )(status)();

  if (E.isLeft(result)) {
    context.log.error(
      `MessageStatusUpdaterActivity|MESSAGE_ID=${messageId}|STATUS=${status}|ERROR=${JSON.stringify(
        result.left
      )}`
    );
    throw new Error(JSON.stringify(result.left));
  }

  context.log.verbose(
    `MessageStatusUpdaterActivity|MESSAGE_ID=${messageId}|STATUS=${status}|RESULT=SUCCESS`
  );

  return { kind: "SUCCESS" };
};
