/* eslint-disable max-lines-per-function */

import { Context } from "@azure/functions";
import {
  getMessageStatusUpdater,
  MessageStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { MessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusValue";
import {
  MessageModel,
  RetrievedMessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";
import { constant, pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import * as T from "fp-ts/Task";
import {
  CosmosDecodingError,
  CosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  asyncIterableToArray,
  flattenAsyncIterable
} from "@pagopa/io-functions-commons/dist/src/utils/async";
import { CreatedMessageEvent } from "../utils/events/message";
import { withDecodedInput } from "../utils/with-decoded-input";
import { withJsonInput } from "../utils/with-json-input";
import { initTelemetryClient } from "../utils/appinsights";

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
        // Query for message with input messageId in order to retrieve the fiscalCode
        lMessageModel.getQueryIterator({
          parameters: [{ name: "@messageId", value: messageId }],
          query: `SELECT TOP 1 * FROM m WHERE m.id = @messageId`
        }),
        flattenAsyncIterable,
        asyncIterableToArray,
        constant,
        T.map(messages =>
          messages.length === 1
            ? pipe(messages[0], E.mapLeft(CosmosDecodingError))
            : E.left(
                CosmosErrorResponse({
                  code: 404,
                  message: "Missing message",
                  name: "Not Found"
                })
              )
        ),
        TE.chainEitherKW(x =>
          pipe(
            x,
            RetrievedMessageWithoutContent.decode,
            E.mapLeft(CosmosDecodingError)
          )
        ),
        // create the message status for the failed message
        TE.chain(message =>
          getMessageStatusUpdater(
            lMessageStatusModel,
            messageId,
            message.fiscalCode
          )(MessageStatusValueEnum.FAILED)
        ),
        // throw error to trigger retry
        TE.mapLeft(e => {
          throw e;
        }),
        // track failed message on app insights
        TE.map(()=> {
          telemetryClient.trackEvent({
            name: "api.messages.create.failedprocessing",
            properties: {
              messageId
            },
            tagOverrides: { samplingEnabled: "false" }
          });
        }),
        TE.toUnion
      )()
    )
  );
