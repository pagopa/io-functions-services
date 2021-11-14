/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-null/no-null */
/* eslint-disable sonar/sonar-max-lines-per-function */

jest.mock("applicationinsights");
jest.mock("azure-storage");

import {
  EmailString,
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";

import { CreatedMessageEventSenderMetadata } from "@pagopa/io-functions-commons/dist/src/models/created_message_sender_metadata";
import { Notification } from "@pagopa/io-functions-commons/dist/src/models/notification";
import { isTransientError } from "@pagopa/io-functions-commons/dist/src/utils/errors";

import { NotificationEvent } from "@pagopa/io-functions-commons/dist/src/models/notification_event";

import { readableReport } from "@pagopa/ts-commons/lib/reporters";

import { getWebhookNotificationHandler, sendToWebhook } from "../handler";

import { HttpsUrl } from "@pagopa/io-functions-commons/dist/generated/definitions/HttpsUrl";
import { MessageBodyMarkdown } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageBodyMarkdown";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { MessageSubject } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageSubject";
import { NotificationChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import { getNotifyClient } from "../client";

import { agent } from "@pagopa/ts-commons";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "@pagopa/ts-commons/lib/fetch";
import { Millisecond } from "@pagopa/ts-commons/lib/units";

import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetAllMocks();
});

const mockAppinsights = {
  trackDependency: jest.fn(),
  trackEvent: jest.fn()
};

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
  serviceName: "service" as NonEmptyString,
  serviceUserEmail: "email@exmaple.com" as EmailString
};

const aNotificationEvent = {
  content: {
    markdown: aMessageBodyMarkdown,
    subject: aMessageBodySubject
  },
  message: aMessage,
  notificationId: aNotificationId,
  senderMetadata: aSenderMetadata
};

const getMockNotificationEvent = (
  messageContent: MessageContent = {
    markdown: aMessageBodyMarkdown,
    subject: aMessageBodySubject
  }
) => {
  return pipe(
    {
      ...aNotificationEvent,
      content: messageContent,
      message: aNotificationEvent.message
    },
    NotificationEvent.decode,
    E.getOrElseW(errs => {
      throw new Error(
        "Cannot deserialize NotificationEvent: " + readableReport(errs)
      );
    })
  );
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
  // eslint-disable-next-line no-console
  error: console.error,
  // eslint-disable-next-line no-console
  verbose: console.log,
  // eslint-disable-next-line no-console
  warn: console.warn
};

const mockFetch = <T>(status: number, json: T) => {
  return jest.fn((_1, _2) => ({
    json: () => Promise.resolve(json),
    status
  }));
};

const mockContext = {
  log: nullLog,
  executionContext: { functionName: "funcname" }
} as any;

describe("sendToWebhook", () => {
  it("should succeded with right parameters", async () => {
    const expectedResponse = { message: "OK" };
    const fetchApi = mockFetch(200, expectedResponse);
    const notifyApiCall = getNotifyClient(fetchApi as any);
    const ret = await sendToWebhook(
      notifyApiCall,
      "http://localhost/test" as HttpsUrl,
      aMessage as any,
      aMessageContent,
      aSenderMetadata,
      false
    )();
    expect(E.isRight(ret)).toBeTruthy();
  });

  it("should remove message content if the service require secure channel", async () => {
    const expectedResponse = { message: "OK" };
    const fetchApi = mockFetch(200, expectedResponse);
    const notifyApiCall = getNotifyClient(fetchApi as any);
    const ret = await sendToWebhook(
      notifyApiCall,
      "http://localhost/test" as HttpsUrl,
      aMessage as any,
      aMessageContent,
      {
        ...aSenderMetadata,
        requireSecureChannels: true
      },
      false
    )();
    expect(fetchApi.mock.calls[0][1]).toHaveProperty("body");
    const body = JSON.parse(fetchApi.mock.calls[0][1].body);
    expect(body).toHaveProperty("message");
    expect(body).toHaveProperty("sender_metadata");
    expect(body).not.toHaveProperty("content");
    expect(E.isRight(ret)).toBeTruthy();
  });
  it("should remove message content if webhook message content is disabled", async () => {
    const expectedResponse = { message: "OK" };
    const fetchApi = mockFetch(200, expectedResponse);
    const notifyApiCall = getNotifyClient(fetchApi as any);
    const ret = await sendToWebhook(
      notifyApiCall,
      "http://localhost/test" as HttpsUrl,
      aMessage as any,
      aMessageContent,
      aSenderMetadata,
      true
    )();
    expect(fetchApi.mock.calls[0][1]).toHaveProperty("body");
    const body = JSON.parse(fetchApi.mock.calls[0][1].body);
    expect(body).toHaveProperty("message");
    expect(body).toHaveProperty("sender_metadata");
    expect(body).not.toHaveProperty("content");
    expect(E.isRight(ret)).toBeTruthy();
  });
  it("should return a transient error in case of timeout", async () => {
    const abortableFetch = AbortableFetch(agent.getHttpsFetch(process.env));
    const fetchWithTimeout = setFetchTimeout(1 as Millisecond, abortableFetch);
    const notifyApiCall = getNotifyClient(toFetch(fetchWithTimeout));
    const ret = await sendToWebhook(
      notifyApiCall,
      "http://localhost/test" as HttpsUrl,
      aMessage as any,
      aMessageContent,
      aSenderMetadata,
      false
    )();
    expect(E.isLeft(ret)).toBeTruthy();
    if (E.isLeft(ret)) {
      expect(isTransientError(ret.left)).toBeTruthy();
    }
  });

  it("should return a transient error in case the webhook returns HTTP status 5xx", async () => {
    const fetchApi = mockFetch(500, { status: 500 });
    const notifyApiCall = getNotifyClient(fetchApi as any);
    const ret = await sendToWebhook(
      notifyApiCall,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      false
    )();
    expect(fetchApi).toHaveBeenCalledTimes(1);
    expect(E.isLeft(ret)).toBeTruthy();
    if (E.isLeft(ret)) {
      expect(isTransientError(ret.left)).toBeTruthy();
    }
  });

  it("should return a permanent error in case the webhook returns HTTP status 4xx", async () => {
    const fetchApi = mockFetch(401, { status: 401 });
    const notifyApiCall = getNotifyClient(fetchApi as any);
    const ret = await sendToWebhook(
      notifyApiCall,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      false
    )();
    expect(fetchApi).toHaveBeenCalledTimes(1);
    expect(E.isLeft(ret)).toBeTruthy();
    if (E.isLeft(ret)) {
      expect(isTransientError(ret.left)).toBeFalsy();
    }
  });
});

describe("handler", () => {
  it("should return a transient error when there's an error while retrieving the notification", async () => {
    const notificationModelMock = {
      find: jest.fn(() => TE.left("error"))
    };

    await expect(
      getWebhookNotificationHandler(
        notificationModelMock as any,
        {} as any,
        false
      )(
        mockContext,
        JSON.stringify({
          notificationEvent: getMockNotificationEvent()
        })
      )
    ).rejects.toThrow();
  });

  it("should return a transient error when the notification does not exist", async () => {
    const notificationModelMock = {
      find: jest.fn(() => TE.of(O.none))
    };

    await expect(
      getWebhookNotificationHandler(
        notificationModelMock as any,
        {} as any,
        false
      )(
        mockContext,
        JSON.stringify({
          notificationEvent: getMockNotificationEvent()
        })
      )
    ).rejects.toThrow();
  });

  it("should return a permanent error when the notification does not contain the webhook url", async () => {
    const notificationModelMock = {
      find: jest.fn(() => TE.of(O.some({})))
    };

    await expect(
      getWebhookNotificationHandler(
        notificationModelMock as any,
        {} as any,
        false
      )(
        mockContext,
        JSON.stringify({
          notificationEvent: getMockNotificationEvent()
        })
      )
    ).resolves.toEqual({ kind: "FAILURE", reason: "DECODE_ERROR" });
  });

  it("should forward a notification", async () => {
    const notificationModelMock = {
      find: jest.fn(() => TE.of(O.some(aNotification))),
      update: jest.fn(() => TE.of(O.some(aNotification)))
    };

    const notifyCallApiMock = jest
      .fn()
      .mockReturnValue(Promise.resolve(E.right({ status: 200 })));

    const result = await getWebhookNotificationHandler(
      notificationModelMock as any,
      notifyCallApiMock as any,
      false
    )(
      mockContext,
      JSON.stringify({
        notificationEvent: getMockNotificationEvent(aMessageContent)
      })
    );

    expect(result).toEqual({
      kind: "SUCCESS",
      result: "OK"
    });
  });

  it("should forward a notification with the provided subject", async () => {
    const customSubject = "A custom subject" as MessageSubject;

    const notifyCallApiMock = jest
      .fn()
      .mockReturnValue(Promise.resolve(E.right({ status: 200 })));

    const aLongMessageContent = {
      markdown: aMessageBodyMarkdown,
      subject: customSubject
    };

    const notificationModelMock = {
      find: jest.fn(() => TE.of(O.some(aNotification))),
      update: jest.fn(() => TE.of(O.some(aNotification)))
    };

    const result = await getWebhookNotificationHandler(
      notificationModelMock as any,
      notifyCallApiMock,
      false
    )(
      mockContext,
      JSON.stringify({
        notificationEvent: getMockNotificationEvent(aLongMessageContent)
      })
    );

    expect(result).toEqual({
      kind: "SUCCESS",
      result: "OK"
    });
  });

  it("should track delivery failures", async () => {
    const notifyCallApiMock = jest
      .fn()
      .mockReturnValue(Promise.resolve(E.right({ status: 401 })));

    const notificationModelMock = {
      find: jest.fn(() => TE.of(O.some(aNotification))),
      update: jest.fn(() => TE.of(O.some(aNotification)))
    };

    await expect(
      getWebhookNotificationHandler(
        notificationModelMock as any,
        notifyCallApiMock,
        false
      )(
        mockContext,
        JSON.stringify({
          notificationEvent: getMockNotificationEvent(aMessageContent)
        })
      )
    ).resolves.toEqual({ kind: "FAILURE", reason: "SEND_TO_WEBHOOK_FAILED" });

    expect(notificationModelMock.update).not.toHaveBeenCalled();
  });

  it("should stop processing in case the message is expired", async () => {
    const notificationModelMock = {
      find: jest.fn(() => E.right(O.some({})))
    };

    const notificationEvent = getMockNotificationEvent();

    const ret = await getWebhookNotificationHandler(
      notificationModelMock as any,
      {} as any,
      false
    )(
      mockContext,
      JSON.stringify({
        notificationEvent: {
          ...notificationEvent,
          message: {
            ...notificationEvent.message,
            createdAt: new Date("2012-12-12")
          }
        }
      })
    );

    expect(ret).toEqual({ kind: "SUCCESS", result: "EXPIRED" });
  });
});
