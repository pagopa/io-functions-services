import * as TE from "fp-ts/TaskEither";
import * as E from "fp-ts/Either";
import { NotificationModel } from "@pagopa/io-functions-commons/dist/src/models/notification";

import {
  getCreateNotificationHandler,
  NotificationCreatedEvent
} from "../handler";
import { HttpsUrl } from "@pagopa/io-functions-commons/dist/generated/definitions/HttpsUrl";
import { pipe } from "fp-ts/lib/function";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { Context } from "@azure/functions";
import {
  aMessageContent,
  aNewMessageWithoutContent,
  aCreatedMessageEventSenderMetadata,
  aRetrievedProfile
} from "../../__mocks__/mocks";

const mockNotificationCreate = jest
  .fn()
  .mockImplementation(() => TE.of({ id: "any-notification-id" }));

const mockNotificaionModel = ({
  create: mockNotificationCreate
} as unknown) as NotificationModel;

const aDefaultWebhookUrl = pipe(
  HttpsUrl.decode("https://example.com"),
  E.getOrElseW(err => {
    throw fail(`Cannot decode url: ${readableReport(err)}`);
  })
);

const aSandboxFiscalCode = "AAAAAA00A00A000A" as FiscalCode;

const createContext = () =>
  (({
    bindings: {},
    executionContext: { functionName: "funcname" },
    log: { ...console, verbose: console.log }
  } as unknown) as Context);

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

describe("getCreateNotificationHandler", () => {
  it("should send email notification to user who enabled email", async () => {
    const handler = getCreateNotificationHandler(
      mockNotificaionModel,
      aDefaultWebhookUrl,
      aSandboxFiscalCode,
      [],
      []
    );

    const context = createContext();
    await handler(
      context,
      JSON.stringify({
        blockedInboxOrChannels: [],
        profile: aProfileWithEmailEnabled,
        content: aMessageContent,
        message: aNewMessageWithoutContent,
        senderMetadata: aCreatedMessageEventSenderMetadata
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
      []
    );

    const context = createContext();
    await handler(
      context,
      JSON.stringify({
        blockedInboxOrChannels: [],
        profile: aProfileWithWebhookEnabled,
        content: aMessageContent,
        message: aNewMessageWithoutContent,
        senderMetadata: aCreatedMessageEventSenderMetadata
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
