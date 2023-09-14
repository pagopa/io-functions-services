/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonar/sonar-max-lines-per-function */

import { none, Option, some } from "fp-ts/lib/Option";
import * as O from "fp-ts/Option";

import { QueryError } from "documentdb";

import {
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  EmailString,
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";

import {
  NewMessageWithoutContent,
  RetrievedMessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";
import { MessageStatus } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import {
  NotificationAddressSourceEnum,
  RetrievedNotification
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import {
  makeStatusId,
  RetrievedNotificationStatus
} from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { toAuthorizedCIDRs } from "@pagopa/io-functions-commons/dist/src/models/service";

import { ExternalCreatedMessageWithoutContent } from "@pagopa/io-functions-commons/dist/generated/definitions/ExternalCreatedMessageWithoutContent";
import { ExternalMessageResponseWithoutContent } from "@pagopa/io-functions-commons/dist/generated/definitions/ExternalMessageResponseWithoutContent";
import { MaxAllowedPaymentAmount } from "@pagopa/io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";
import { NotRejectedMessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotRejectedMessageStatusValue";
import { NotificationChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import { NotificationChannelStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannelStatusValue";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import { FeatureLevelTypeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/FeatureLevelType";
import { ReadStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ReadStatus";

import * as TE from "fp-ts/lib/TaskEither";

import { GetMessageHandler } from "../handler";

import { aMessageContent, aPaymentMessageContent } from "../../__mocks__/mocks";

import { PaymentStatusEnum } from "../../generated/definitions/PaymentStatus";

// Tests
// -----------------------

describe("GetMessageHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  jest.useFakeTimers();

  // Read status checker
  const mockMessageReadStatusAuth = jest.fn();
  mockMessageReadStatusAuth.mockImplementation((_serviceId, _fiscalCode) =>
    TE.of<Error, boolean>(false)
  );

  const getMockMessageReadStatusAuth = () =>
    jest.fn((_serviceId, _fiscalCode) => TE.of<Error, boolean>(false));

  // -----------------------

  const mockContext = {
    log: {
      // eslint-disable-next-line no-console
      error: console.error,
      // eslint-disable-next-line no-console
      info: console.log,
      // eslint-disable-next-line no-console
      verbose: console.log,
      // eslint-disable-next-line no-console
      warn: console.warn
    }
  } as any;

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const aFiscalCode = "FRLFRC74E04B157I" as FiscalCode;
  const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;
  const anEmail = "test@example.com" as EmailString;

  const aDate = new Date();
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

  const aUserAuthenticationTrustedApplicationWithAdvancedFetures: IAzureApiAuthorization = {
    groups: new Set([
      UserGroup.ApiMessageRead,
      UserGroup.ApiMessageList,
      UserGroup.ApiMessageReadAdvanced
    ]),
    kind: "IAzureApiAuthorization",
    subscriptionId: "s123" as NonEmptyString,
    userId: "u123" as NonEmptyString
  };

  const aMessageId = "A_MESSAGE_ID" as NonEmptyString;

  const aNewMessageWithoutContent: NewMessageWithoutContent = {
    createdAt: aDate,
    featureLevelType: FeatureLevelTypeEnum.STANDARD,
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
    _etag: "_etag",
    _rid: "_rid",
    _self: "xyz",
    _ts: 1,
    kind: "IRetrievedMessageWithoutContent"
  };

  const aPublicExtendedMessage: ExternalCreatedMessageWithoutContent = {
    created_at: aDate,
    feature_level_type: FeatureLevelTypeEnum.STANDARD,
    fiscal_code: aNewMessageWithoutContent.fiscalCode,
    id: "A_MESSAGE_ID",
    sender_service_id: aNewMessageWithoutContent.senderServiceId,
    time_to_live: 3600 as TimeToLiveSeconds
  };

  const aPublicExtendedMessageResponse: ExternalMessageResponseWithoutContent = {
    message: aPublicExtendedMessage,
    notification: {
      email: NotificationChannelStatusValueEnum.SENT,
      webhook: NotificationChannelStatusValueEnum.SENT
    },
    status: NotRejectedMessageStatusValueEnum.ACCEPTED
  };

  function getNotificationModelMock(
    aRetrievedNotification: any = {
      data: "data"
    }
  ): any {
    return {
      findNotificationForMessage: jest.fn(() =>
        TE.of(some(aRetrievedNotification))
      )
    };
  }

  const aRetrievedNotificationStatus: RetrievedNotificationStatus = {
    _etag: "_etag",
    _rid: "_rid",
    _self: "xyz",
    _ts: 1,
    channel: NotificationChannelEnum.EMAIL,
    id: "1" as NonEmptyString,
    kind: "IRetrievedNotificationStatus",
    messageId: "1" as NonEmptyString,
    notificationId: "1" as NonEmptyString,
    status: NotificationChannelStatusValueEnum.SENT,
    statusId: makeStatusId(
      "1" as NonEmptyString,
      NotificationChannelEnum.EMAIL
    ),
    updatedAt: aDate,
    version: 1 as NonNegativeInteger
  };

  const aMessageStatus: MessageStatus = {
    messageId: aMessageId,
    status: NotRejectedMessageStatusValueEnum.ACCEPTED,
    updatedAt: aDate,
    isRead: false,
    isArchived: false
  };

  function getNotificationStatusModelMock(
    retrievedNotificationStatus: any = TE.of(some(aRetrievedNotificationStatus))
  ): any {
    return {
      findOneNotificationStatusByNotificationChannel: jest.fn(
        () => retrievedNotificationStatus
      )
    };
  }

  function getMessageStatusModelMock(
    s: TE.TaskEither<QueryError, Option<MessageStatus>> = TE.of(
      some(aMessageStatus)
    )
  ): any {
    return {
      findLastVersionByModelId: jest.fn().mockReturnValue(s),
      upsert: jest.fn(status => TE.left(status))
    };
  }

  const getPaymentUpdaterClientMock = (paid: boolean = false) => ({
    getMessagePayment: jest.fn().mockImplementation(() =>
      TE.right({
        status: 200,
        value: {
          paid
        },
        headers: {}
      })()
    )
  });
  const getBrokenPaymentUpdaterClientMock = (status: number) => ({
    getMessagePayment: jest.fn().mockImplementation(() =>
      TE.right({
        status,
        value: {
          status
        },
        headers: {}
      })()
    )
  });

  it("should respond with a message if requesting user is the sender", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => TE.of(none))
    };

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock()
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
        TE.of(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => TE.left(new Error()))
    };

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock()
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
        TE.of(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => TE.of(none))
    };

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock()
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
      findMessageForRecipient: jest.fn(() => TE.of(some(message))),
      getContentFromBlob: jest.fn(() => TE.of(none))
    };

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(),
      {} as any,
      {} as any,
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock()
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
    expect(result.detail).toContain(
      "You are not allowed to read this message, you can only read messages that you have sent"
    );
  });

  it("should respond with not found a message doesn not exist", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() => TE.of(none)),
      getContentFromBlob: jest.fn(() => TE.of(none))
    };

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(),
      {} as any,
      {} as any,
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock()
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
      _etag: "_etag",
      _rid: "_rid",
      _self: "xyz",
      _ts: 1,
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
        TE.of(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => TE.of(none))
    };

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock()
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
      expect(result.value).toEqual({
        ...aPublicExtendedMessageResponse
      });
    }
  });

  it("should fail if any error occurs trying to retrieve the message status", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => TE.of(none))
    };

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(
        TE.left<QueryError, Option<MessageStatus>>({
          body: "error",
          code: 1
        })
      ),
      getNotificationModelMock(),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock()
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
        TE.of(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => TE.of(none))
    };

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(),
      {
        findNotificationForMessage: jest.fn(() =>
          TE.left({
            body: "error",
            code: 1
          })
        )
      } as any,
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock()
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

  // ---------------------------
  // Advanced Features
  // ---------------------------

  const aRetrievedNotification: RetrievedNotification = {
    _etag: "_etag",
    _rid: "_rid",
    _self: "xyz",
    _ts: 1,
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

  const aRetrievedMessageWithAdvancedFeatures = {
    ...aRetrievedMessageWithoutContent,
    isPending: false,
    featureLevelType: FeatureLevelTypeEnum.ADVANCED
  };

  const aPublicExtendedMessageResponseWithContent = {
    ...aPublicExtendedMessageResponse,
    message: {
      ...aPublicExtendedMessageResponse.message,
      content: aMessageContent
    }
  };

  const aPublicExtendedMessageResponseWithContentWithAdvancedFeatures = {
    ...aPublicExtendedMessageResponseWithContent,
    message: {
      ...aPublicExtendedMessageResponseWithContent.message,
      feature_level_type: FeatureLevelTypeEnum.ADVANCED
    }
  };

  it("should NOT provide information about read and payment status if message is of type STANDARD", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(some({ ...aRetrievedMessageWithoutContent, isPending: false }))
      ),
      getContentFromBlob: jest.fn(() => TE.of(O.some(aMessageContent)))
    };

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock()
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationTrustedApplicationWithAdvancedFetures,
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
      expect(result.value).toEqual(aPublicExtendedMessageResponseWithContent);
      expect(result.value).not.toHaveProperty("read_status");
      expect(result.value).not.toHaveProperty("payment_status");
    }
  });

  it("should NOT provide information about read and payment status if user is not allowed (no 'ApiMessageReadAdvanced' auth group)", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(some(aRetrievedMessageWithAdvancedFeatures))
      ),
      getContentFromBlob: jest.fn(() => TE.of(O.some(aMessageContent)))
    };

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock()
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
    expect(mockMessageReadStatusAuth).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        ...aPublicExtendedMessageResponseWithContentWithAdvancedFeatures
      });
      expect(result.value).not.toHaveProperty("payment_status");
      expect(result.value).not.toHaveProperty("read_status");
    }
  });

  it("should NOT provide information about read status if message is pending", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(
          some({ ...aRetrievedMessageWithAdvancedFeatures, isPending: true })
        )
      ),
      getContentFromBlob: jest.fn(() => TE.of(O.some(aMessageContent)))
    };

    mockMessageReadStatusAuth.mockReturnValueOnce(TE.right(true));

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock()
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationTrustedApplicationWithAdvancedFetures,
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
    expect(mockMessageReadStatusAuth).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        ...aPublicExtendedMessageResponseWithContentWithAdvancedFeatures
      });

      expect(result.value).not.toHaveProperty("payment_status");
      expect(result.value).not.toHaveProperty("read_status");
    }
  });

  it("should provide information about read status if user is allowed and message is of type ADVANCED", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(
          some({ ...aRetrievedMessageWithAdvancedFeatures, isPending: false })
        )
      ),
      getContentFromBlob: jest.fn(() => TE.of(O.some(aMessageContent)))
    };

    mockMessageReadStatusAuth.mockReturnValueOnce(TE.right(true));

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock()
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationTrustedApplicationWithAdvancedFetures,
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
    expect(mockMessageReadStatusAuth).toHaveBeenCalled();

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        ...aPublicExtendedMessageResponseWithContentWithAdvancedFeatures,
        read_status: aMessageStatus.isRead
          ? ReadStatusEnum.READ
          : ReadStatusEnum.UNREAD,
        payment_status: undefined
      });
    }
  });

  it("should return UNAVAILABLE as read status if user is NOT allowed and message is of type ADVANCED", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(
          some({ ...aRetrievedMessageWithAdvancedFeatures, isPending: false })
        )
      ),
      getContentFromBlob: jest.fn(() => TE.of(O.some(aMessageContent)))
    };

    // Using base mockMessageReadStatusAuth it's not working correctly
    const mockMessageReadStatusAuth = getMockMessageReadStatusAuth();
    mockMessageReadStatusAuth.mockReturnValueOnce(TE.of(false));

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock()
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationTrustedApplicationWithAdvancedFetures,
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
    expect(mockMessageReadStatusAuth).toHaveBeenCalled();

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        ...aPublicExtendedMessageResponseWithContentWithAdvancedFeatures,
        read_status: ReadStatusEnum.UNAVAILABLE
      });
    }
  });

  it("should provide information about payment status if user is allowed and message is of type ADVANCED", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(some(aRetrievedMessageWithAdvancedFeatures))
      ),
      getContentFromBlob: jest.fn(() => TE.of(O.some(aPaymentMessageContent)))
    };

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(
        TE.of(
          some({
            ...aMessageStatus,
            status: NotRejectedMessageStatusValueEnum.PROCESSED
          })
        )
      ),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock(true)
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationTrustedApplicationWithAdvancedFetures,
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
      expect(result.value).toEqual(
        expect.objectContaining({
          payment_status: PaymentStatusEnum.PAID
        })
      );
    }
  });

  it("should NOT provide information about payment status if user is allowed and message is of type ADVANCED but FF is disabled", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(some(aRetrievedMessageWithAdvancedFeatures))
      ),
      getContentFromBlob: jest.fn(() => TE.of(O.some(aPaymentMessageContent)))
    };

    const getMessageHandler = GetMessageHandler(
      false,
      mockMessageModel as any,
      getMessageStatusModelMock(
        TE.of(
          some({
            ...aMessageStatus,
            status: NotRejectedMessageStatusValueEnum.PROCESSED
          })
        )
      ),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getPaymentUpdaterClientMock(true)
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationTrustedApplicationWithAdvancedFetures,
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
      expect(result.value).toEqual(
        expect.objectContaining({
          payment_status: undefined
        })
      );
    }
  });

  it("should provide default information about payment status if user is allowed and message is of type ADVANCED and message is not found in payment updater", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(some(aRetrievedMessageWithAdvancedFeatures))
      ),
      getContentFromBlob: jest.fn(() => TE.of(O.some(aPaymentMessageContent)))
    };

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(
        TE.of(
          some({
            ...aMessageStatus,
            status: NotRejectedMessageStatusValueEnum.PROCESSED
          })
        )
      ),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getBrokenPaymentUpdaterClientMock(404)
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationTrustedApplicationWithAdvancedFetures,
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
      expect(result.value).toEqual(
        expect.objectContaining({
          payment_status: PaymentStatusEnum.NOT_PAID
        })
      );
    }
  });

  it("should return an internal error if user is allowed and message is of type ADVANCED and payment updater is broken", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(some(aRetrievedMessageWithAdvancedFeatures))
      ),
      getContentFromBlob: jest.fn(() => TE.of(O.some(aPaymentMessageContent)))
    };

    const getMessageHandler = GetMessageHandler(
      true,
      mockMessageModel as any,
      getMessageStatusModelMock(
        TE.of(
          some({
            ...aMessageStatus,
            status: NotRejectedMessageStatusValueEnum.PROCESSED
          })
        )
      ),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth,
      getBrokenPaymentUpdaterClientMock(503)
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationTrustedApplicationWithAdvancedFetures,
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

    expect(result).toEqual(
      expect.objectContaining({
        detail:
          "Internal server error: Error retrieving Payment Status: Failed to fetch payment status from Payment Updater: 503",
        kind: "IResponseErrorInternal"
      })
    );
  });
});
