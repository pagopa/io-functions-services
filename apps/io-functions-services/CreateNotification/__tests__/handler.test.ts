import { Context } from "@azure/functions";
import { HttpsUrl } from "@pagopa/io-functions-commons/dist/generated/definitions/HttpsUrl";
import { NotificationModel } from "@pagopa/io-functions-commons/dist/src/models/notification";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { fail } from "assert";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it, vi } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import {
  aCreatedMessageEventSenderMetadata,
  aMessageContent,
  aNewMessageWithoutContent,
  aRetrievedProfile
} from "../../__mocks__/mocks";
import { NotificationCreatedEvent } from "../../utils/events/message";
import { getCreateNotificationHandler } from "../handler";

const mockNotificationCreate = vi
  .fn()
  .mockImplementation(() => TE.of({ id: "any-notification-id" }));

const mockNotificaionModel = {
  create: mockNotificationCreate
} as unknown as NotificationModel;

const aDefaultWebhookUrl = pipe(
  HttpsUrl.decode("https://example.com"),
  E.getOrElseW(err => {
    throw fail(`Cannot decode url: ${readableReport(err)}`);
  })
);

const aSandboxFiscalCode = "AAAAAA00A00A000A" as FiscalCode;

const createContext = () =>
  ({
    bindings: {},
    executionContext: { functionName: "funcname" },
    log: { ...console, verbose: console.log }
  }) as unknown as Context;

const aProfileWithWebhookEnabled = {
  ...aRetrievedProfile,
  isWebhookEnabled: true
};

const aProfileWithEmailEnabled = {
  ...aRetrievedProfile,
  email: "email@example.com",
  isEmailEnabled: true,
  isEmailValidated: true,
  isInboxEnabled: true
};

const mockRetrieveProcessingMessageData = vi.fn().mockImplementation(() =>
  TE.of(
    O.some({
      content: aMessageContent,
      message: aNewMessageWithoutContent,
      senderMetadata: aCreatedMessageEventSenderMetadata
    })
  )
);

describe("getCreateNotificationHandler", () => {
  it("should send email notification to user who enabled email", async () => {
    const handler = getCreateNotificationHandler(
      mockNotificaionModel,
      aDefaultWebhookUrl,
      aSandboxFiscalCode,
      [],
      [],
      mockRetrieveProcessingMessageData
    );

    const context = createContext();
    await handler(
      context,
      JSON.stringify({
        blockedInboxOrChannels: [],
        messageId: aNewMessageWithoutContent.id,
        profile: aProfileWithEmailEnabled
      })
    );

    expect(context.bindings.notificationCreatedEmail).toBeDefined();

    expect(
      pipe(
        context.bindings.notificationCreatedEmail,
        NotificationCreatedEvent.decode,
        E.isRight
      )
    ).toBe(true);
  });

  it("should send webhook notification to user who enabled webhook", async () => {
    const handler = getCreateNotificationHandler(
      mockNotificaionModel,
      aDefaultWebhookUrl,
      aSandboxFiscalCode,
      [],
      [],
      mockRetrieveProcessingMessageData
    );

    const context = createContext();
    await handler(
      context,
      JSON.stringify({
        blockedInboxOrChannels: [],
        messageId: aNewMessageWithoutContent.id,
        profile: aProfileWithWebhookEnabled
      })
    );

    expect(context.bindings.notificationCreatedWebhook).toBeDefined();

    expect(
      pipe(
        context.bindings.notificationCreatedWebhook,
        NotificationCreatedEvent.decode,
        E.isRight
      )
    ).toBe(true);
  });
});
