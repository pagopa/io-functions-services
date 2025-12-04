/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock("applicationinsights");
vi.mock("azure-storage");

import { StandardServiceCategoryEnum } from "@pagopa/io-functions-admin-sdk/StandardServiceCategory";
import { HttpsUrl } from "@pagopa/io-functions-commons/dist/generated/definitions/HttpsUrl";
import { MessageBodyMarkdown } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageBodyMarkdown";
import { MessageSubject } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageSubject";
import { NotificationChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import { CreatedMessageEventSenderMetadata } from "@pagopa/io-functions-commons/dist/src/models/created_message_sender_metadata";
import { Notification } from "@pagopa/io-functions-commons/dist/src/models/notification";
import { isTransientError } from "@pagopa/io-functions-commons/dist/src/utils/errors";
import { agent } from "@pagopa/ts-commons";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "@pagopa/ts-commons/lib/fetch";
import {
  EmailString,
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import { Millisecond } from "@pagopa/ts-commons/lib/units";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNotifyClient } from "../client";
import { getWebhookNotificationHandler, sendToWebhook } from "../handler";

const aFiscalCode = "FRLFRC74E04B157I" as FiscalCode;

const aMessageId = "A_MESSAGE_ID" as NonEmptyString;

const aMessage = {
  createdAt: new Date().toISOString(),
  fiscalCode: aFiscalCode,
  id: aMessageId,
  indexedId: aMessageId,
  kind: "INewMessageWithoutContent",
  senderServiceId: "s123" as NonEmptyString,
  senderUserId: "u123" as NonEmptyString,
  timeToLiveSeconds: 3600 as TimeToLiveSeconds
};

const aMessageContent = {
  markdown: `# Hello world!
    lorem ipsum
  `.repeat(10) as MessageBodyMarkdown,
  subject: "test".repeat(10) as MessageSubject
};

const aMessageBodyMarkdown = "test".repeat(80) as MessageBodyMarkdown;
const aMessageBodySubject = "t".repeat(30) as MessageSubject;

const aNotificationId = "A_NOTIFICATION_ID" as NonEmptyString;
const anOrganizationFiscalCode = "00000000000" as OrganizationFiscalCode;

const aSenderMetadata: CreatedMessageEventSenderMetadata = {
  departmentName: "dept" as NonEmptyString,
  organizationFiscalCode: anOrganizationFiscalCode,
  organizationName: "org" as NonEmptyString,
  requireSecureChannels: false,
  serviceCategory: StandardServiceCategoryEnum.STANDARD,
  serviceName: "service" as NonEmptyString,
  serviceUserEmail: "email@exmaple.com" as EmailString
};

const aNotificationEvent = {
  messageId: aMessage.id,
  notificationId: aNotificationId
};

const aNotification: Notification = {
  channels: {
    [NotificationChannelEnum.WEBHOOK]: {
      url: "https://webhook.localhost.local/hook" as HttpsUrl
    }
  },
  fiscalCode: aFiscalCode,
  messageId: aMessageId
};

const nullLog = {
  error: console.error,

  verbose: console.log,

  warn: console.warn
};

const mockFetch = <T>(status: number, json: T) =>
  vi.fn((_1, _2) => ({
    json: () => Promise.resolve(json),
    status
  }));

const mockContext = {
  executionContext: { functionName: "funcname" },
  log: nullLog
} as any;

const aCommonMessageData = {
  content: {
    markdown: aMessageBodyMarkdown,
    subject: aMessageBodySubject
  },
  message: aMessage,
  senderMetadata: aSenderMetadata
};

const mockRetrieveProcessingMessageData = vi
  .fn()
  .mockImplementation(() => TE.of(O.some(aCommonMessageData)));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendToWebhook", () => {
  it("should succeded with right parameters, with message content", async () => {
    const expectedResponse = {};
    const fetchApi = mockFetch(204, expectedResponse);
    const notifyApiCall = getNotifyClient(fetchApi as any, "aValidApiKey");
    const ret = await sendToWebhook(
      notifyApiCall,
      "http://localhost/test" as HttpsUrl,
      aMessage as any
    )();

    expect(fetchApi.mock.calls[0][1]).toHaveProperty("body");
    const body = JSON.parse(fetchApi.mock.calls[0][1].body);
    expect(body).toHaveProperty("fiscal_code");
    expect(body).toHaveProperty("notification_type");
    expect(body).toHaveProperty("message_id");
    expect(body).toHaveProperty("webhookEndpoint");
    expect(E.isRight(ret)).toBeTruthy();
  });

  it("should return a transient error in case of timeout", async () => {
    const abortableFetch = AbortableFetch(agent.getHttpsFetch(process.env));
    const fetchWithTimeout = setFetchTimeout(1 as Millisecond, abortableFetch);
    const notifyApiCall = getNotifyClient(
      toFetch(fetchWithTimeout),
      "aValidApiKey"
    );
    const ret = await sendToWebhook(
      notifyApiCall,
      "http://localhost/test" as HttpsUrl,
      aMessage as any
    )();
    expect(E.isLeft(ret)).toBeTruthy();
    if (E.isLeft(ret)) {
      expect(isTransientError(ret.left)).toBeTruthy();
    }
  });

  it("should return a transient error in case the webhook returns HTTP status 5xx", async () => {
    const fetchApi = mockFetch(500, { status: 500 });
    const notifyApiCall = getNotifyClient(fetchApi as any, "aValidApiKey");
    const ret = await sendToWebhook(notifyApiCall, {} as any, {} as any)();
    expect(fetchApi).toHaveBeenCalledTimes(1);
    expect(E.isLeft(ret)).toBeTruthy();
    if (E.isLeft(ret)) {
      expect(isTransientError(ret.left)).toBeTruthy();
    }
  });

  it("should return a permanent error in case the webhook returns HTTP status 4xx", async () => {
    const fetchApi = mockFetch(401, { status: 401 });
    const notifyApiCall = getNotifyClient(fetchApi as any, "aValidApiKey");
    const ret = await sendToWebhook(notifyApiCall, {} as any, {} as any)();
    expect(fetchApi).toHaveBeenCalledTimes(1);
    expect(E.isLeft(ret)).toBeTruthy();
    if (E.isLeft(ret)) {
      expect(isTransientError(ret.left)).toBeFalsy();
    }
  });
});

describe("handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("should return a transient error when there's an error while retrieving the notification", async () => {
    const notificationModelMock = {
      find: vi.fn(() => TE.left("error"))
    };

    await expect(
      getWebhookNotificationHandler(
        notificationModelMock as any,
        {} as any,
        mockRetrieveProcessingMessageData,
        "https://example.com" as HttpsUrl
      )(mockContext, JSON.stringify(aNotificationEvent))
    ).rejects.toThrow();
  });

  it("should return a transient error when the notification does not exist", async () => {
    const notificationModelMock = {
      find: vi.fn(() => TE.of(O.none))
    };

    await expect(
      getWebhookNotificationHandler(
        notificationModelMock as any,
        {} as any,
        mockRetrieveProcessingMessageData,
        "https://example.com" as HttpsUrl
      )(mockContext, JSON.stringify(aNotificationEvent))
    ).rejects.toThrow();
  });

  it("should return a permanent error when the notification does not contain the webhook url", async () => {
    const notificationModelMock = {
      find: vi.fn(() => TE.of(O.some({})))
    };

    await expect(
      getWebhookNotificationHandler(
        notificationModelMock as any,
        {} as any,
        mockRetrieveProcessingMessageData,
        "https://example.com" as HttpsUrl
      )(mockContext, JSON.stringify(aNotificationEvent))
    ).resolves.toEqual({ kind: "FAILURE", reason: "DECODE_ERROR" });
  });

  it("should forward a notification", async () => {
    const notificationModelMock = {
      find: vi.fn(() => TE.of(O.some(aNotification))),
      update: vi.fn(() => TE.of(O.some(aNotification)))
    };

    const notifyCallApiMock = vi
      .fn()
      .mockReturnValue(Promise.resolve(E.right({ status: 204 })));

    mockRetrieveProcessingMessageData.mockImplementationOnce(() =>
      TE.of(O.some({ ...aCommonMessageData, content: aMessageContent }))
    );

    const result = await getWebhookNotificationHandler(
      notificationModelMock as any,
      notifyCallApiMock as any,
      mockRetrieveProcessingMessageData,
      "https://example.com" as HttpsUrl
    )(mockContext, JSON.stringify(aNotificationEvent));

    expect(result).toEqual({
      kind: "SUCCESS",
      result: "OK"
    });
  });

  it("should forward a notification with the provided subject", async () => {
    const customSubject = "A custom subject" as MessageSubject;

    const notifyCallApiMock = vi
      .fn()
      .mockReturnValue(Promise.resolve(E.right({ status: 204 })));

    const aLongMessageContent = {
      markdown: aMessageBodyMarkdown,
      subject: customSubject
    };

    const notificationModelMock = {
      find: vi.fn(() => TE.of(O.some(aNotification))),
      update: vi.fn(() => TE.of(O.some(aNotification)))
    };

    mockRetrieveProcessingMessageData.mockImplementationOnce(() =>
      TE.of(O.some({ ...aCommonMessageData, content: aLongMessageContent }))
    );

    const result = await getWebhookNotificationHandler(
      notificationModelMock as any,
      notifyCallApiMock,
      mockRetrieveProcessingMessageData,
      "https://example.com" as HttpsUrl
    )(mockContext, JSON.stringify(aNotificationEvent));

    expect(result).toEqual({
      kind: "SUCCESS",
      result: "OK"
    });
  });

  it("should track delivery failures", async () => {
    const notifyCallApiMock = vi
      .fn()
      .mockReturnValue(Promise.resolve(E.right({ status: 401 })));

    mockRetrieveProcessingMessageData.mockImplementationOnce(() =>
      TE.of(O.some({ ...aCommonMessageData, content: aMessageContent }))
    );

    const notificationModelMock = {
      find: vi.fn(() => TE.of(O.some(aNotification))),
      update: vi.fn(() => TE.of(O.some(aNotification)))
    };

    await expect(
      getWebhookNotificationHandler(
        notificationModelMock as any,
        notifyCallApiMock,
        mockRetrieveProcessingMessageData,
        "https://example.com" as HttpsUrl
      )(mockContext, JSON.stringify(aNotificationEvent))
    ).resolves.toEqual({ kind: "FAILURE", reason: "SEND_TO_WEBHOOK_FAILED" });

    expect(notificationModelMock.update).not.toHaveBeenCalled();
  });

  it("should stop processing in case the message is expired", async () => {
    const notificationModelMock = {
      find: vi.fn(() => E.right(O.some({})))
    };

    mockRetrieveProcessingMessageData.mockImplementationOnce(() =>
      TE.of(
        O.some({
          ...aCommonMessageData,
          message: {
            ...aCommonMessageData.message,
            createdAt: new Date("2012-12-12")
          }
        })
      )
    );

    const ret = await getWebhookNotificationHandler(
      notificationModelMock as any,
      {} as any,
      mockRetrieveProcessingMessageData,
      "https://example.com" as HttpsUrl
    )(mockContext, JSON.stringify(aNotificationEvent));

    expect(ret).toEqual({ kind: "SUCCESS", result: "EXPIRED" });
  });
});
