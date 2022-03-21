import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as MS from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { initTelemetryClient } from "../../utils/appinsights";
import { MessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { NonNegativeNumber } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { getOnFailedProcessMessageHandler } from "../handler";
import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
import { Context } from "@azure/functions";
import { CreatedMessageEvent } from "../../utils/events/message";
import {
  aNewMessageWithoutContent,
  aRetrievedMessage,
  aRetrievedMessageStatus
} from "../../__mocks__/mocks";

const contextMock = ({
  bindings: {},
  executionContext: { functionName: "funcname" },
  // eslint-disable no-console
  log: { ...console, verbose: console.log }
} as unknown) as Context;

const mockTelemetryClient = ({
  trackEvent: jest.fn()
} as unknown) as ReturnType<typeof initTelemetryClient>;

const getQueryIteratorMock = jest.fn();
const lMessageModel = ({
  getQueryIterator: getQueryIteratorMock
} as unknown) as MessageModel;

const lMessageStatusModel = ({
  upsert: (...args) => TE.of({} /* anything */),
  findLastVersionByModelId: (...args) => TE.right(O.none)
} as unknown) as MS.MessageStatusModel;
const getMessageStatusUpdaterMock = jest.spyOn(MS, "getMessageStatusUpdater");

const aCreatedMessageEvent: CreatedMessageEvent = {
  messageId: aNewMessageWithoutContent.id,
  serviceVersion: 1 as NonNegativeNumber
};

beforeEach(() => {
  jest.clearAllMocks();
  // Mock getMessageStatusUpdater
  getMessageStatusUpdaterMock.mockImplementation(
    (
      _messageStatusModel: MS.MessageStatusModel,
      messageId: NonEmptyString,
      fiscalCode: FiscalCode
    ) => (status: MessageStatusValueEnum) =>
      TE.right({
        ...aRetrievedMessageStatus,
        id: messageId,
        messageId,
        status,
        fiscalCode
      })
  );
  getQueryIteratorMock.mockImplementation(() => {
    const asyncIterable = {
      [Symbol.asyncIterator]() {
        return {
          i: 0,
          async next() {
            if (this.i++ < 1) {
              return await Promise.resolve({
                value: [E.right(aRetrievedMessage)],
                done: false
              });
            }

            return { done: true };
          }
        };
      }
    };
    return asyncIterable;
  });
});

describe("getOnFailedProcessMessageHandler", () => {
  it("GIVEN a created message event with an existing messageId WHEN the failed handler is called THEN the message status is created with input messageId and retreived fiscalCode", async () => {
    await getOnFailedProcessMessageHandler({
      lMessageStatusModel,
      lMessageModel,
      telemetryClient: mockTelemetryClient
    })(contextMock, aCreatedMessageEvent);

    expect(getMessageStatusUpdaterMock).toBeCalledWith(
      lMessageStatusModel,
      aCreatedMessageEvent.messageId,
      aRetrievedMessage.fiscalCode
    );

    expect(getQueryIteratorMock).toBeCalledWith(
      expect.objectContaining({
        parameters: expect.arrayContaining([
          expect.objectContaining({ value: aCreatedMessageEvent.messageId })
        ])
      })
    );

    expect(mockTelemetryClient.trackEvent).toBeCalledWith(
      expect.objectContaining({
        name: "api.messages.create.failedprocessing",
        properties: expect.objectContaining({ messageId: "A_MESSAGE_ID" })
      })
    );
  });

  it("GIVEN a created message event with an not existing messageId WHEN the failed handler is called THEN a cosmos exception is thrown", async () => {
    getQueryIteratorMock.mockImplementationOnce(() => ({
      [Symbol.asyncIterator]() {
        return {
          i: 0,
          async next() {
            return { done: true };
          }
        };
      }
    }));

    await expect(
      getOnFailedProcessMessageHandler({
        lMessageStatusModel,
        lMessageModel,
        telemetryClient: mockTelemetryClient
      })(contextMock, aCreatedMessageEvent)
    ).rejects.toEqual(
      expect.objectContaining({ kind: "COSMOS_ERROR_RESPONSE" })
    );
  });
});
