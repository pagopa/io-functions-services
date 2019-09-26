/* tslint:disable:no-any */
/* tslint:disable:no-null-keyword */
/* tslint:disable:no-big-function */

jest.mock("applicationinsights");
jest.mock("azure-storage");

import { none, some } from "fp-ts/lib/Option";

import { isLeft, left, right } from "fp-ts/lib/Either";
import {
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";

import { CreatedMessageEventSenderMetadata } from "io-functions-commons/dist/src/models/created_message_sender_metadata";
import { Notification } from "io-functions-commons/dist/src/models/notification";
import { isTransientError } from "io-functions-commons/dist/src/utils/errors";

import { NotificationEvent } from "io-functions-commons/dist/src/models/notification_event";

import { readableReport } from "italia-ts-commons/lib/reporters";

import * as superagent from "superagent";

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

// as superagent does not export request methods directly
// we must override the superagent.Request prototype
// so we can set up our jest mock to use it instead
// of the send() method
const mockSuperagentResponse = (response: any) => {
  const sendMock = jest.fn();
  // tslint:disable-next-line:no-object-mutation
  (superagent as any).Request.prototype.send = sendMock;
  return sendMock.mockReturnValueOnce(Promise.resolve(response));
};

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
  serviceName: "service" as NonEmptyString
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

const nullContext = {
  log: nullLog
} as any;

describe("sendToWebhook", () => {
  it("should return a transient error in case of timeout", async () => {
    const sendMock = jest.fn();
    sendMock.mockImplementation(() => {
      return Promise.reject({ timeout: true });
    });
    // tslint:disable-next-line:no-object-mutation
    (superagent as any).Request.prototype.send = sendMock;
    const ret = await sendToWebhook({} as any, {} as any, {} as any, {} as any);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(isLeft(ret)).toBeTruthy();
    if (isLeft(ret)) {
      expect(isTransientError(ret.value)).toBeTruthy();
    }
  });

  it("should return a transient error in case the webhook returns HTTP status 5xx", async () => {
    const sendMock = jest.fn();
    sendMock.mockImplementation(() => {
      return Promise.reject({ status: 555 });
    });
    // tslint:disable-next-line:no-object-mutation
    (superagent as any).Request.prototype.send = sendMock;
    const ret = await sendToWebhook({} as any, {} as any, {} as any, {} as any);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(isLeft(ret)).toBeTruthy();
    if (isLeft(ret)) {
      expect(isTransientError(ret.value)).toBeTruthy();
    }
  });

  it("should return a permanent error in case the webhook returns HTTP status 4xx", async () => {
    const sendMock = jest.fn();
    sendMock.mockImplementation(() => {
      return Promise.reject({ status: 444 });
    });
    // tslint:disable-next-line:no-object-mutation
    (superagent as any).Request.prototype.send = sendMock;
    const ret = await sendToWebhook({} as any, {} as any, {} as any, {} as any);
    expect(sendMock).toHaveBeenCalledTimes(1);
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
        notificationModelMock as any
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

    mockSuperagentResponse({ status: 200 });

    const result = await getWebhookNotificationActivityHandler(
      getAppinsightsMock as any,
      notificationModelMock as any
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

    mockSuperagentResponse({ status: 200 });

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
      notificationModelMock as any
    )(nullContext, {
      notificationEvent: getMockNotificationEvent(aLongMessageContent)
    });

    expect(result).toEqual({
      kind: "SUCCESS",
      result: "OK"
    });
  });

  it("should respond with a transient error when delivery fails", async () => {
    mockSuperagentResponse({
      error: true,
      text: "some error"
    });

    const notificationModelMock = {
      find: jest.fn(() => right(some(aNotification))),
      update: jest.fn(() => right(some(aNotification)))
    };

    await expect(
      getWebhookNotificationActivityHandler(
        getAppinsightsMock as any,
        notificationModelMock as any
      )(nullContext, {
        notificationEvent: getMockNotificationEvent(aMessageContent)
      })
    ).rejects.toThrow();

    expect(mockAppinsights.trackDependency).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "notification.webhook.delivery",
        properties: {
          error: "Permanent HTTP error calling API Proxy: some error"
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
      notificationModelMock as any
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
