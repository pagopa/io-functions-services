/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonar/sonar-max-lines-per-function */

import { none, Option, some } from "fp-ts/lib/Option";

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
import { MessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { NotificationChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import { NotificationChannelStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannelStatusValue";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import { FeatureLevelTypeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/FeatureLevelType";

import * as TE from "fp-ts/lib/TaskEither";

import { GetMessageHandler } from "../handler";

import {
  aMessageContentWithLegalData,
  aMessagePayload
} from "../../__mocks__/mocks";

// Tests
// -----------------------

// Read status checker
const getMockMessageReadStatusAuth = () =>
  jest.fn((_serviceId, _fiscalCode) => TE.of<Error, boolean>(false));

let mockMessageReadStatusAuth = getMockMessageReadStatusAuth();

describe("GetMessageHandler", () => {
  jest.useFakeTimers();

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

  afterEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();

    mockMessageReadStatusAuth = getMockMessageReadStatusAuth();
  });

  afterAll(() => {
    jest.useRealTimers();
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

  const aUserAuthenticationLegalDeveloper: IAzureApiAuthorization = {
    groups: new Set([UserGroup.ApiLegalMessageRead]),
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
    createdAt: new Date(),
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
    created_at: new Date(),
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
    status: MessageStatusValueEnum.ACCEPTED
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
    updatedAt: new Date(),
    version: 1 as NonNegativeInteger
  };

  const aMessageStatus: MessageStatus = {
    messageId: aMessageId,
    status: MessageStatusValueEnum.ACCEPTED,
    updatedAt: new Date(),
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

  it("should respond with a message if requesting user is the sender", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => TE.of(none))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth
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
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth
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
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth
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
      mockMessageModel as any,
      getMessageStatusModelMock(),
      {} as any,
      {} as any,
      {} as any,
      mockMessageReadStatusAuth
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

  it("should respond with forbidden if requesting user is not allowed to see legal message", async () => {
    const message = {
      ...aRetrievedMessageWithoutContent,
      senderServiceId: "anotherOrg"
    };

    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() => TE.of(some(message))),
      getContentFromBlob: jest.fn(() =>
        TE.of(some(aMessageContentWithLegalData))
      )
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      {} as any,
      {} as any,
      {} as any,
      mockMessageReadStatusAuth
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

  it("should respond with forbidden if requesting user is allowed to see legal_message but not other messages", async () => {
    const message = {
      ...aRetrievedMessageWithoutContent,
      senderServiceId: "anotherOrg"
    };

    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() => TE.of(some(message))),
      getContentFromBlob: jest.fn(() => TE.of(some(aMessagePayload.content)))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      {} as any,
      {} as any,
      {} as any,
      mockMessageReadStatusAuth
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationLegalDeveloper,
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

  it("should respond with Not Found if requesting user is allowed to see legal_message but message content is not stored yet", async () => {
    const message = {
      ...aRetrievedMessageWithoutContent,
      senderServiceId: "anotherOrg"
    };

    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() => TE.of(some(message))),
      getContentFromBlob: jest.fn(() => TE.of(none))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      {} as any,
      {} as any,
      {} as any,
      mockMessageReadStatusAuth
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationLegalDeveloper,
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

    expect(result.kind).toBe("IResponseErrorNotFound");
  });

  it("should respond with a message with legal data if requesting user is allowed to see legal message", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() =>
        TE.of(some(aMessageContentWithLegalData))
      )
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth
    );

    const result = await getMessageHandler(
      mockContext,
      aUserAuthenticationLegalDeveloper,
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
        ...aPublicExtendedMessageResponse,
        message: {
          ...aPublicExtendedMessageResponse.message,
          time_to_live: 3600,
          content: { ...aMessageContentWithLegalData }
        }
      });
    }
  });

  it("should respond with not found a message doesn not exist", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() => TE.of(none)),
      getContentFromBlob: jest.fn(() => TE.of(none))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      {} as any,
      {} as any,
      {} as any,
      mockMessageReadStatusAuth
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
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth
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
      mockMessageReadStatusAuth
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
      mockMessageReadStatusAuth
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
    featureLevelType: FeatureLevelTypeEnum.ADVANCED
  };

  const aPublicExtendedMessageResponseWithAdvancedFeatures = {
    ...aPublicExtendedMessageResponse,
    message: {
      ...aPublicExtendedMessageResponse.message,
      feature_level_type: FeatureLevelTypeEnum.ADVANCED
    }
  };

  it("should NOT provide information about read and payment status if message is of type STANDARD", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(some(aRetrievedMessageWithoutContent))
      ),
      getContentFromBlob: jest.fn(() => TE.of(none))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth
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
      expect(result.value).toEqual(aPublicExtendedMessageResponse);
      expect(result.value).not.toHaveProperty("read_status");
      expect(result.value).not.toHaveProperty("payment_status");
    }
  });

  it("should NOT provide information about read and payment status if user is not allowed", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(some(aRetrievedMessageWithAdvancedFeatures))
      ),
      getContentFromBlob: jest.fn(() => TE.of(none))
    };

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth
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
    expect(mockMessageReadStatusAuth).toHaveBeenCalled();

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual(
        aPublicExtendedMessageResponseWithAdvancedFeatures
      );
      expect(result.value).not.toHaveProperty("read_status");
      expect(result.value).not.toHaveProperty("payment_status");
    }
  });

  it("should provide information about read status if user is allowed and message is of type ADVANCED", async () => {
    const mockMessageModel = {
      findMessageForRecipient: jest.fn(() =>
        TE.of(some(aRetrievedMessageWithAdvancedFeatures))
      ),
      getContentFromBlob: jest.fn(() => TE.of(none))
    };

    mockMessageReadStatusAuth.mockReturnValueOnce(TE.right(true));

    const getMessageHandler = GetMessageHandler(
      mockMessageModel as any,
      getMessageStatusModelMock(),
      getNotificationModelMock(aRetrievedNotification),
      getNotificationStatusModelMock(),
      {} as any,
      mockMessageReadStatusAuth
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
        ...aPublicExtendedMessageResponseWithAdvancedFeatures,
        read_status: aMessageStatus.isRead ? "READ" : "UNREAD"
      });
    }
  });
});
