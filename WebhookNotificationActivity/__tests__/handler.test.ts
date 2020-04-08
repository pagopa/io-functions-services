/* tslint:disable:no-any */
/* tslint:disable:no-null-keyword */
/* tslint:disable:no-big-function */

jest.mock("applicationinsights");
jest.mock("azure-storage");

import { isLeft, left, right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import {
  EmailString,
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";

import { CreatedMessageEventSenderMetadata } from "io-functions-commons/dist/src/models/created_message_sender_metadata";
import { Notification } from "io-functions-commons/dist/src/models/notification";
import { isTransientError } from "io-functions-commons/dist/src/utils/errors";

import { NotificationEvent } from "io-functions-commons/dist/src/models/notification_event";

import { readableReport } from "italia-ts-commons/lib/reporters";

import {
  getWebhookNotificationActivityHandler,
  sendToWebhook
} from "../handler";

import { HttpsUrl } from "io-functions-commons/dist/generated/definitions/HttpsUrl";
import { MessageBodyMarkdown } from "io-functions-commons/dist/generated/definitions/MessageBodyMarkdown";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import { MessageSubject } from "io-functions-commons/dist/generated/definitions/MessageSubject";
import { NotificationChannelEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannel";
import { TimeToLiveSeconds } from "io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import { getNotifyClient } from "../client";

import { agent } from "italia-ts-commons";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "italia-ts-commons/lib/fetch";
import { Millisecond } from "italia-ts-commons/lib/units";

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetAllMocks();
});

const mockAppinsights = {
  trackDependency: jest.fn(),
  trackEvent: jest.fn()
};

const getAppinsightsMock = () => mockAppinsights;

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
  return NotificationEvent.decode(
    Object.assign({}, aNotificationEvent, {
      content: messageContent,
      message: aNotificationEvent.message
    })
  ).getOrElseL(errs => {
    throw new Error(
      "Cannot deserialize NotificationEvent: " + readableReport(errs)
    );
  });
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
  // tslint:disable-next-line: no-console
  error: console.error,
  // tslint:disable-next-line: no-console
  verbose: console.log,
  // tslint:disable-next-line: no-console
  warn: console.warn
};

const mockFetch = <T>(status: number, json: T) => {
  return jest.fn(() => ({
    json: () => Promise.resolve(json),
    status
  }));
};

const nullContext = {
  log: nullLog
} as any;

describe("sendToWebhook", () => {
  it("should return a transient error in case of timeout", async () => {
    const abortableFetch = AbortableFetch(agent.getHttpsFetch(process.env));
    const fetchWithTimeout = setFetchTimeout(1 as Millisecond, abortableFetch);
    const notifyApiCall = getNotifyClient(toFetch(fetchWithTimeout));
    const ret = await sendToWebhook(
      notifyApiCall,
      "http://localhost/test" as HttpsUrl,
      aMessage as any,
      aMessageContent,
      aSenderMetadata
    ).run();
    expect(isLeft(ret)).toBeTruthy();
    if (isLeft(ret)) {
      expect(isTransientError(ret.value)).toBeTruthy();
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
      {} as any
    ).run();
    expect(fetchApi).toHaveBeenCalledTimes(1);
    expect(isLeft(ret)).toBeTruthy();
    if (isLeft(ret)) {
      expect(isTransientError(ret.value)).toBeTruthy();
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
      {} as any
    ).run();
    expect(fetchApi).toHaveBeenCalledTimes(1);
    expect(isLeft(ret)).toBeTruthy();
    if (isLeft(ret)) {
      expect(isTransientError(ret.value)).toBeFalsy();
    }
  });
});

describe("handler", () => {
  it("should return a transient error when there's an error while retrieving the notification", async () => {
    const notificationModelMock = {
      find: jest.fn(() => left("error"))
    };

    await expect(
      getWebhookNotificationActivityHandler(
        {} as any,
        getAppinsightsMock as any,
        notificationModelMock as any
      )(nullContext, {
        notificationEvent: getMockNotificationEvent()
      })
    ).rejects.toThrow();
  });

  it("should return a transient error when the notification does not exist", async () => {
    const notificationModelMock = {
      find: jest.fn(() => right(none))
    };

    await expect(
      getWebhookNotificationActivityHandler(
        {} as any,
        getAppinsightsMock as any,
        notificationModelMock as any
      )(nullContext, {
        notificationEvent: getMockNotificationEvent()
      })
    ).rejects.toThrow();
  });

  it("should return a permanent error when the notification does not contain the webhook url", async () => {
    const notificationModelMock = {
      find: jest.fn(() => right(some({})))
    };

    await expect(
      getWebhookNotificationActivityHandler(
        getAppinsightsMock as any,
        notificationModelMock as any,
        {} as any
      )(nullContext, {
        notificationEvent: getMockNotificationEvent()
      })
    ).resolves.toEqual({ kind: "FAILURE", reason: "DECODE_ERROR" });
  });

  it("should forward a notification", async () => {
    const notificationModelMock = {
      find: jest.fn(() => Promise.resolve(right(some(aNotification)))),
      update: jest.fn(() => Promise.resolve(right(some(aNotification))))
    };

    const notifyCallApiMock = jest
      .fn()
      .mockReturnValue(Promise.resolve(right({ status: 200 })));

    const result = await getWebhookNotificationActivityHandler(
      getAppinsightsMock as any,
      notificationModelMock as any,
      notifyCallApiMock as any
    )(nullContext, {
      notificationEvent: getMockNotificationEvent(aMessageContent)
    });

    expect(mockAppinsights.trackDependency).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "notification.webhook.delivery",
        resultCode: 200,
        success: true
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
      .mockReturnValue(Promise.resolve(right({ status: 200 })));

    const aLongMessageContent = {
      markdown: aMessageBodyMarkdown,
      subject: customSubject
    };

    const notificationModelMock = {
      find: jest.fn(() => right(some(aNotification))),
      update: jest.fn(() => right(some(aNotification)))
    };

    const result = await getWebhookNotificationActivityHandler(
      getAppinsightsMock as any,
      notificationModelMock as any,
      notifyCallApiMock
    )(nullContext, {
      notificationEvent: getMockNotificationEvent(aLongMessageContent)
    });

    expect(result).toEqual({
      kind: "SUCCESS",
      result: "OK"
    });
  });

  it("should track delivery failures", async () => {
    const notifyCallApiMock = jest
      .fn()
      .mockReturnValue(Promise.resolve(right({ status: 401 })));

    const notificationModelMock = {
      find: jest.fn(() => right(some(aNotification))),
      update: jest.fn(() => right(some(aNotification)))
    };

    await expect(
      getWebhookNotificationActivityHandler(
        getAppinsightsMock as any,
        notificationModelMock as any,
        notifyCallApiMock
      )(nullContext, {
        notificationEvent: getMockNotificationEvent(aMessageContent)
      })
    ).resolves.toEqual({ kind: "FAILURE", reason: "SEND_TO_WEBHOOK_FAILED" });

    expect(mockAppinsights.trackDependency).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "notification.webhook.delivery",
        properties: {
          error: "Permanent HTTP error calling webhook: 401"
        },
        resultCode: "PermanentError",
        success: false
      })
    );

    expect(notificationModelMock.update).not.toHaveBeenCalled();
  });

  it("should stop processing in case the message is expired", async () => {
    const notificationModelMock = {
      find: jest.fn(() => right(some({})))
    };

    const notificationEvent = getMockNotificationEvent();

    const ret = await getWebhookNotificationActivityHandler(
      getAppinsightsMock as any,
      notificationModelMock as any,
      {} as any
    )(nullContext, {
      notificationEvent: {
        ...notificationEvent,
        message: {
          ...notificationEvent.message,
          createdAt: new Date("2012-12-12")
        }
      }
    });

    expect(ret).toEqual({ kind: "SUCCESS", result: "EXPIRED" });
  });
});
