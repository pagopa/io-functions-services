/* eslint-disable max-lines-per-function */

import { Context } from "@azure/functions";
import { NotRejectedMessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotRejectedMessageStatusValue";
import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  MessageStatusModel,
  getMessageStatusUpdater
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import {
  asyncIterableToArray,
  flattenAsyncIterable
} from "@pagopa/io-functions-commons/dist/src/utils/async";
import {
  CosmosDecodingError,
  CosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import { constant, pipe } from "fp-ts/lib/function";

import { initTelemetryClient } from "../utils/appinsights";
import { CreatedMessageEvent } from "../utils/events/message";
import { withDecodedInput } from "../utils/with-decoded-input";
import { withJsonInput } from "../utils/with-json-input";

export interface IOnFailedProcessMessageHandlerInput {
  readonly lMessageStatusModel: MessageStatusModel;
  readonly lMessageModel: MessageModel;
  readonly telemetryClient: ReturnType<typeof initTelemetryClient>;
}

type Handler = (c: Context, i: unknown) => Promise<void>;

/**
 * Returns a function for handling ProcessMessage
 */
export const getOnFailedProcessMessageHandler = ({
  lMessageStatusModel,
  lMessageModel,
  telemetryClient
}: IOnFailedProcessMessageHandlerInput): Handler =>
  withJsonInput(
    withDecodedInput(CreatedMessageEvent, async (_, { messageId }) =>
      pipe(
        // query for message with input messageId in order to retrieve the fiscalCode
        lMessageModel.getQueryIterator({
          parameters: [{ name: "@messageId", value: messageId }],
          query: `SELECT TOP 1 * FROM m WHERE m.id = @messageId`
        }),
        flattenAsyncIterable,
        asyncIterableToArray,
        constant,
        TE.fromTask,
        TE.filterOrElse(
          (messages) => messages.length === 1,
          () =>
            CosmosErrorResponse({
              code: 404,
              message: "Missing message",
              name: "Not Found"
            })
        ),
        TE.chainEitherKW((messages) =>
          pipe(messages[0], E.mapLeft(CosmosDecodingError))
        ),
        // create the message status for the failed message
        TE.chain((message) =>
          getMessageStatusUpdater(
            lMessageStatusModel,
            messageId,
            message.fiscalCode
          )({ status: NotRejectedMessageStatusValueEnum.FAILED })
        ),
        TE.map(() => {
          telemetryClient.trackEvent({
            name: "api.messages.create.failedprocessing",
            properties: {
              messageId
            },
            tagOverrides: { samplingEnabled: "false" }
          });
        }),
        // throw error to trigger retry
        TE.getOrElse((e) => {
          throw e;
        })
      )()
    )
  );
