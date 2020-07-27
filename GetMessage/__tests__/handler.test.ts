/* tslint:disable:no-any */
/* tslint:disable:no-duplicate-string */
/* tslint:disable:no-big-function */

import { Either, left, right } from "fp-ts/lib/Either";
import { none, Option, some } from "fp-ts/lib/Option";

import { QueryError } from "documentdb";

import {
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";

import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";
import {
  EmailString,
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";

import {
  NewMessageWithoutContent,
  RetrievedMessageWithoutContent
} from "io-functions-commons/dist/src/models/message";
import { MessageStatus } from "io-functions-commons/dist/src/models/message_status";
import {
  NotificationAddressSourceEnum,
  RetrievedNotification
} from "io-functions-commons/dist/src/models/notification";
import {
  makeStatusId,
  RetrievedNotificationStatus
} from "io-functions-commons/dist/src/models/notification_status";
import { toAuthorizedCIDRs } from "io-functions-commons/dist/src/models/service";

import { CreatedMessageWithoutContent } from "io-functions-commons/dist/generated/definitions/CreatedMessageWithoutContent";
import { MaxAllowedPaymentAmount } from "io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";
import { MessageResponseWithoutContent } from "io-functions-commons/dist/generated/definitions/MessageResponseWithoutContent";
import { MessageStatusValueEnum } from "io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { NotificationChannelEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannel";
import { NotificationChannelStatusValueEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannelStatusValue";
import { ServiceId } from "io-functions-commons/dist/generated/definitions/ServiceId";
import { TimeToLiveSeconds } from "io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";

import { GetMessageHandler } from "../handler";

const mockContext = {
  log: {
    // tslint:disable-next-line: no-console
    error: console.error,
    // tslint:disable-next-line: no-console
    info: console.log,
    // tslint:disable-next-line: no-console
    verbose: console.log,
    // tslint:disable-next-line: no-console
    warn: console.warn
  }
} as any;

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

const aFiscalCode = "FRLFRC74E04B157I" as FiscalCode;
const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;
const anEmail = "test@example.com" as EmailString;

const someUserAttributes: IAzureUserAttributes = {
  email: anEmail,
  kind: "IAzureUserAttributes",
  service: {
    authorizedCIDRs: toAuthorizedCIDRs([]),
    authorizedRecipients: new Set([]),
    departmentName: "IT" as NonEmptyString,
    isVisible: true,
    maxAllowedPaymentAmount: 0 as MaxAllowedPaymentAmount,
    organizationFiscalCode: anOrganizationFiscalCode,
    organizationName: "AgID" as NonEmptyString,
    requireSecureChannels: false,
    serviceId: "test" as NonEmptyString,
    serviceName: "Test" as NonEmptyString,
    version: 1 as NonNegativeInteger
  }
};

const aUserAuthenticationDeveloper: IAzureApiAuthorization = {
  groups: new Set([UserGroup.ApiMessageRead, UserGroup.ApiMessageWrite]),
  kind: "IAzureApiAuthorization",
  subscriptionId: "s123" as NonEmptyString,
  userId: "u123" as NonEmptyString
};

const aUserAuthenticationTrustedApplication: IAzureApiAuthorization = {
  groups: new Set([UserGroup.ApiMessageRead, UserGroup.ApiMessageList]),
  kind: "IAzureApiAuthorization",
  subscriptionId: "s123" as NonEmptyString,
  userId: "u123" as NonEmptyString
};

const aMessageId = "A_MESSAGE_ID" as NonEmptyString;

const aNewMessageWithoutContent: NewMessageWithoutContent = {
  createdAt: new Date(),
  fiscalCode: aFiscalCode,
  id: "A_MESSAGE_ID" as NonEmptyString,
  indexedId: "A_MESSAGE_ID" as NonEmptyString,
  isPending: true,
  kind: "INewMessageWithoutContent",
  senderServiceId: "test" as ServiceId,
  senderUserId: "u123" as NonEmptyString,
  timeToLiveSeconds: 3600 as TimeToLiveSeconds
};

const aRetrievedMessageWithoutContent: RetrievedMessageWithoutContent = {
  ...aNewMessageWithoutContent,
  _self: "xyz",
  _ts: 1,
  kind: "IRetrievedMessageWithoutContent"
};

const aPublicExtendedMessage: CreatedMessageWithoutContent = {
  created_at: new Date(),
  fiscal_code: aNewMessageWithoutContent.fiscalCode,
  id: "A_MESSAGE_ID",
  sender_service_id: aNewMessageWithoutContent.senderServiceId
};

const aPublicExtendedMessageResponse: MessageResponseWithoutContent = {
  message: aPublicExtendedMessage,
  notification: {
    email: NotificationChannelStatusValueEnum.SENT,
    webhook: NotificationChannelStatusValueEnum.SENT
  },
  status: MessageStatusValueEnum.ACCEPTED
};

function getNotificationModelMock(
  aRetrievedNotification: any = { data: "data" }
): any {
  return {
    findNotificationForMessage: jest.fn(() =>
      Promise.resolve(right(some(aRetrievedNotification)))
    )
  };
}

const aRetrievedNotificationStatus: RetrievedNotificationStatus = {
  _self: "xyz",
  _ts: 123,
  channel: NotificationChannelEnum.EMAIL,
  id: "1" as NonEmptyString,
  kind: "IRetrievedNotificationStatus",
  messageId: "1" as NonEmptyString,
  notificationId: "1" as NonEmptyString,
  status: NotificationChannelStatusValueEnum.SENT,
  statusId: makeStatusId("1" as NonEmptyString, NotificationChannelEnum.EMAIL),
  updatedAt: new Date(),
  version: 1 as NonNegativeInteger
};

const aMessageStatus: MessageStatus = {
  messageId: aMessageId,
  status: MessageStatusValueEnum.ACCEPTED,
  updatedAt: new Date()
};

function getNotificationStatusModelMock(
  retrievedNotificationStatus: any = right(some(aRetrievedNotificationStatus))
): any {
  return {
    findOneNotificationStatusByNotificationChannel: jest.fn(() =>
      Promise.resolve(retrievedNotificationStatus)
    )
  };
}

function getMessageStatusModelMock(
  s: Either<QueryError, Option<MessageStatus>> = right(some(aMessageStatus))
): any {
  return {
    findOneByMessageId: jest.fn().mockReturnValue(Promise.resolve(s)),
    upsert: jest.fn(status => Promise.resolve(left(status)))
  };
}

describe("GetMessageHandler", () => {
  it("should respond with a message if requesting user is the sender", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        right(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => right(none))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(),
      getNotificationStatusModelMock(),
      {} as any
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aFiscalCode,
      aRetrievedMessageWithoutContent.id
    );

    expect(mockMessageModel.getContentFromBlob).toHaveBeenCalledTimes(1);
    expect(mockMessageModel.findMessageForRecipient).toHaveBeenCalledTimes(1);
    expect(mockMessageModel.findMessageForRecipient).toHaveBeenCalledWith(
      aRetrievedMessageWithoutContent.fiscalCode,
      aRetrievedMessageWithoutContent.id
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual(aPublicExtendedMessageResponse);
    }
  });

  it("should fail if any error occurs trying to retrieve the message content", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        right(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => left(new Error()))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(),
      getNotificationStatusModelMock(),
      {} as any
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aFiscalCode,
      aRetrievedMessageWithoutContent.id
    );

    expect(mockMessageModel.getContentFromBlob).toHaveBeenCalledTimes(1);
    expect(mockMessageModel.findMessageForRecipient).toHaveBeenCalledTimes(1);
    expect(mockMessageModel.findMessageForRecipient).toHaveBeenCalledWith(
      aRetrievedMessageWithoutContent.fiscalCode,
      aRetrievedMessageWithoutContent.id
    );

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with a message if requesting user is a trusted application", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        right(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => right(none))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(),
      getNotificationStatusModelMock(),
      {} as any
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationTrustedApplication,
      undefined as any, // not used
      someUserAttributes,
      aFiscalCode,
      aRetrievedMessageWithoutContent.id
    );

    expect(mockMessageModel.getContentFromBlob).toHaveBeenCalledTimes(1);
    expect(mockMessageModel.findMessageForRecipient).toHaveBeenCalledTimes(1);
    expect(mockMessageModel.findMessageForRecipient).toHaveBeenCalledWith(
      aRetrievedMessageWithoutContent.fiscalCode,
      aRetrievedMessageWithoutContent.id
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual(aPublicExtendedMessageResponse);
    }
  });

  it("should respond with forbidden if requesting user is not the sender", async () => {
    const message = {
      ...aRetrievedMessageWithoutContent,
      senderServiceId: "anotherOrg"
    };

    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() => right(some(message))),
      getContentFromBlob: jest.fn(() => right(none))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      {} as any,
      {} as any,
      {} as any
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aFiscalCode,
      aRetrievedMessageWithoutContent.id
    );

    expect(mockMessageModel.findMessageForRecipient).toHaveBeenCalledTimes(1);
    expect(mockMessageModel.findMessageForRecipient).toHaveBeenCalledWith(
      aRetrievedMessageWithoutContent.fiscalCode,
      aRetrievedMessageWithoutContent.id
    );

    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with not found a message doesn not exist", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() => right(none)),
      getContentFromBlob: jest.fn(() => right(none))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      {} as any,
      {} as any,
      {} as any
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aFiscalCode,
      aRetrievedMessageWithoutContent.id
    );

    expect(mockMessageModel.findMessageForRecipient).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorNotFound");
  });

  it("should provide information about notification status", async () => {
    const aRetrievedNotification: RetrievedNotification = {
      _self: "xyz",
      _ts: 123,
      channels: {
        [NotificationChannelEnum.EMAIL]: {
          addressSource: NotificationAddressSourceEnum.PROFILE_ADDRESS,
          toAddress: "x@example.com" as EmailString
        }
      },
      fiscalCode: aFiscalCode,
      id: "A_NOTIFICATION_ID" as NonEmptyString,
      kind: "IRetrievedNotification",
      messageId: "A_MESSAGE_ID" as NonEmptyString
    };

    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        right(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => right(none))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationTrustedApplication,
      undefined as any, // not used
      someUserAttributes,
      aFiscalCode,
      aRetrievedMessageWithoutContent.id
    );

    expect(mockMessageModel.getContentFromBlob).toHaveBeenCalledTimes(1);
    expect(mockMessageModel.findMessageForRecipient).toHaveBeenCalledTimes(1);
    expect(mockMessageModel.findMessageForRecipient).toHaveBeenCalledWith(
      aRetrievedMessageWithoutContent.fiscalCode,
      aRetrievedMessageWithoutContent.id
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual(aPublicExtendedMessageResponse);
    }
  });

  it("should fail if any error occurs trying to retrieve the message status", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        right(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => right(none))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(
        left<QueryError, Option<MessageStatus>>({
          body: "error",
          code: 1
        })
      ),
      getNotificationModelMock(),
      getNotificationStatusModelMock(),
      {} as any
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aFiscalCode,
      aRetrievedMessageWithoutContent.id
    );

    expect(result.kind).toBe("IResponseErrorInternal");
  });
  it("should fail if any error occurs trying to retrieve the notification status", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        right(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => right(none))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      {
        findNotificationForMessage: jest.fn(() =>
          Promise.resolve(
            left({
              body: "error",
              code: 1
            })
          )
        )
      } as any,
      getNotificationStatusModelMock(),
      {} as any
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aFiscalCode,
      aRetrievedMessageWithoutContent.id
    );

    expect(result.kind).toBe("IResponseErrorInternal");
  });
});
