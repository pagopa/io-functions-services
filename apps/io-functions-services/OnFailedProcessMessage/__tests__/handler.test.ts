/* eslint-disable @typescript-eslint/no-unused-vars */
import { Context } from "@azure/functions";
import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
import * as MS from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { NonNegativeNumber } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import {
  aNewMessageWithoutContent,
  aRetrievedMessage,
  aRetrievedMessageStatus
} from "../../__mocks__/mocks";
import { initTelemetryClient } from "../../utils/appinsights";
import { CreatedMessageEvent } from "../../utils/events/message";
import { getOnFailedProcessMessageHandler } from "../handler";

const contextMock = {
  bindings: {},
  executionContext: { functionName: "funcname" },
  // eslint-disable no-console
  log: { ...console, verbose: console.log }
} as unknown as Context;

const mockTelemetryClient = {
  trackEvent: vi.fn()
} as unknown as ReturnType<typeof initTelemetryClient>;

const getQueryIteratorMock = vi.fn();
const lMessageModel = {
  getQueryIterator: getQueryIteratorMock
} as unknown as MessageModel;

const lMessageStatusModel = {
  findLastVersionByModelId: (...args: unknown[]) => TE.right(O.none),
  upsert: (...args: unknown[]) => TE.of({} /* anything */)
} as unknown as MS.MessageStatusModel;
const getMessageStatusUpdaterMock = vi.spyOn(MS, "getMessageStatusUpdater");

const aCreatedMessageEvent: CreatedMessageEvent = {
  messageId: aNewMessageWithoutContent.id,
  serviceVersion: 1 as NonNegativeNumber
};

beforeEach(() => {
  vi.clearAllMocks();
  // Mock getMessageStatusUpdater
  getMessageStatusUpdaterMock.mockImplementation(
    (
      _messageStatusModel: MS.MessageStatusModel,
      messageId: NonEmptyString,
      fiscalCode: FiscalCode
    ) =>
      (status: Parameters<MS.MessageStatusUpdater>[0]) =>
        TE.right({
          ...aRetrievedMessageStatus,
          id: messageId,
          messageId,
          ...status,
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
                done: false,
                value: [E.right(aRetrievedMessage)]
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
      lMessageModel,
      lMessageStatusModel,
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
        lMessageModel,
        lMessageStatusModel,
        telemetryClient: mockTelemetryClient
      })(contextMock, aCreatedMessageEvent)
    ).rejects.toEqual(
      expect.objectContaining({ kind: "COSMOS_ERROR_RESPONSE" })
    );
  });
});
