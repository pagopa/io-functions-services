/* eslint-disable max-lines-per-function */

import { Context } from "@azure/functions";
import {
  getMessageStatusUpdater,
  MessageStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { MessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { initTelemetryClient } from "../utils/appinsights";
import { withJsonInput } from "../utils/with-json-input";
import { withDecodedInput } from "../utils/with-decoded-input";
import { CreatedMessageEvent } from "../utils/events/message";

export interface IOnFailedProcessMessageHandlerInput {
  readonly lMessageStatusModel: MessageStatusModel;
  readonly telemetryClient: ReturnType<typeof initTelemetryClient>;
}

type Handler = (c: Context, i: unknown) => Promise<void>;

/**
 * Returns a function for handling ProcessMessage
 */
export const getOnFailedProcessMessageHandler = ({
  lMessageStatusModel,
  telemetryClient
}: IOnFailedProcessMessageHandlerInput): Handler =>
  withJsonInput(
    withDecodedInput(CreatedMessageEvent, async (_, { messageId }) => {
      await getMessageStatusUpdater(
        lMessageStatusModel,
        messageId
      )(MessageStatusValueEnum.FAILED)();

      telemetryClient.trackEvent({
        name: "api.messages.create.failedprocessing",
        properties: {
          messageId
        },
        tagOverrides: { samplingEnabled: "false" }
      });
    })
  );
