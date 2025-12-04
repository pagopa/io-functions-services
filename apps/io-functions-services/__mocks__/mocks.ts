import { ActivationStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ActivationStatus";
import { CIDR } from "@pagopa/io-functions-commons/dist/generated/definitions/CIDR";
import { FeatureLevelTypeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/FeatureLevelType";
import { MessageBodyMarkdown } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageBodyMarkdown";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { MessageSubject } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageSubject";
import { NotRejectedMessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotRejectedMessageStatusValue";
import { PaymentData } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentData";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import { ServicesPreferencesModeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import { StandardServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/StandardServiceCategory";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import {
  Activation,
  ACTIVATION_MODEL_PK_FIELD,
  ACTIVATION_REFERENCE_ID_FIELD,
  RetrievedActivation
} from "@pagopa/io-functions-commons/dist/src/models/activation";
import { CreatedMessageEventSenderMetadata } from "@pagopa/io-functions-commons/dist/src/models/created_message_sender_metadata";
import {
  NewMessageWithoutContent,
  RetrievedMessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";
import { RetrievedMessageStatus } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { RetrievedProfile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  Service,
  ValidService
} from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  AccessReadMessageStatusEnum,
  ServicePreference
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { CosmosResource } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { generateComposedVersionedModelId } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model_composed_versioned";
import {
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import {
  NonNegativeInteger,
  WithinRangeInteger
} from "@pagopa/ts-commons/lib/numbers";
import {
  EmailString,
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/lib/function";

import { errorsToError } from "../utils/responses";

export const anError = new Error("an error");

export const aFiscalCode = "AAABBB01C02D345D" as FiscalCode;
export const anotherFiscalCode = "AAABBB01C02D345W" as FiscalCode;
export const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;

// CosmosResourceMetadata
export const aCosmosResourceMetadata: Omit<CosmosResource, "id"> = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1
};

export const aServiceId: ServiceId = "01234567890" as NonEmptyString;
export const anotherServiceId: ServiceId = "01234567899" as NonEmptyString;

export const aValidService: ValidService = {
  authorizedCIDRs: new Set(["0.0.0.0"] as unknown as CIDR[]),
  authorizedRecipients: new Set([aFiscalCode, anotherFiscalCode]),
  departmentName: "department" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: 0 as unknown as number &
    WithinRangeInteger<0, 9999999999>,
  organizationFiscalCode: "01234567890" as OrganizationFiscalCode,
  organizationName: "Organization" as NonEmptyString,
  requireSecureChannels: true,
  serviceId: aServiceId,
  serviceMetadata: {
    category: StandardServiceCategoryEnum.STANDARD,
    customSpecialFlow: undefined,
    description: "Service Description" as NonEmptyString,
    privacyUrl: "https://example.com/privacy.html" as NonEmptyString,
    scope: ServiceScopeEnum.NATIONAL,
    supportUrl: "https://example.com/support.html" as NonEmptyString
  },
  serviceName: "Service" as NonEmptyString
};

export const anIncompleteService: Service & {
  readonly version: NonNegativeInteger;
} = {
  authorizedCIDRs: new Set(["0.0.0.0"] as unknown as CIDR[]),
  authorizedRecipients: new Set([aFiscalCode, anotherFiscalCode]),
  departmentName: "department" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: 0 as unknown as number &
    WithinRangeInteger<0, 9999999999>,
  organizationFiscalCode: "01234567890" as OrganizationFiscalCode,
  organizationName: "Organization" as NonEmptyString,
  requireSecureChannels: true,
  serviceId: aServiceId,
  serviceMetadata: {
    category: StandardServiceCategoryEnum.STANDARD,
    customSpecialFlow: undefined,
    description: "Service Description" as NonEmptyString,
    scope: ServiceScopeEnum.NATIONAL
  },
  serviceName: "Service" as NonEmptyString,
  version: 1 as NonNegativeInteger
};

export const anAzureApiAuthorization: IAzureApiAuthorization = {
  groups: new Set([UserGroup.ApiLimitedProfileRead, UserGroup.ApiMessageWrite]),
  kind: "IAzureApiAuthorization",
  subscriptionId: "abcdefghi" as NonEmptyString,
  userId: "01234567890" as NonEmptyString
};

export const anAzureUserAttributes: IAzureUserAttributes = {
  email: "foo@example.com" as EmailString,
  kind: "IAzureUserAttributes",
  service: { ...aValidService, version: 0 as NonNegativeInteger }
};

export const legacyProfileServicePreferencesSettings: RetrievedProfile["servicePreferencesSettings"] =
  {
    mode: ServicesPreferencesModeEnum.LEGACY,
    version: -1
  };

export const autoProfileServicePreferencesSettings: RetrievedProfile["servicePreferencesSettings"] =
  {
    mode: ServicesPreferencesModeEnum.AUTO,
    version: 0 as NonNegativeInteger
  };

export const manualProfileServicePreferencesSettings: RetrievedProfile["servicePreferencesSettings"] =
  {
    mode: ServicesPreferencesModeEnum.MANUAL,
    version: 1 as NonNegativeInteger
  };

export const aRetrievedProfile: RetrievedProfile = {
  ...aCosmosResourceMetadata,
  fiscalCode: aFiscalCode,
  id: "123" as NonEmptyString,
  isEmailEnabled: true,
  isEmailValidated: true,
  isInboxEnabled: true,
  isTestProfile: false,
  isWebhookEnabled: false,
  kind: "IRetrievedProfile",
  lastAppVersion: "UNKNOWN",
  pushNotificationsContentType: "UNSET",
  reminderStatus: "UNSET",
  servicePreferencesSettings: legacyProfileServicePreferencesSettings,
  version: 0 as NonNegativeInteger
};

export const aRetrievedMessage: RetrievedMessageWithoutContent = {
  ...aCosmosResourceMetadata,
  createdAt: new Date(),
  featureLevelType: FeatureLevelTypeEnum.STANDARD,
  fiscalCode: aFiscalCode,
  id: "A_MESSAGE_ID" as NonEmptyString,
  indexedId: "AN_INDEXED_ID" as NonEmptyString,
  kind: "IRetrievedMessageWithoutContent",
  senderServiceId: "01234567890" as NonEmptyString,
  senderUserId: "A_USER_ID" as NonEmptyString,
  timeToLiveSeconds: 604800
};

export const aMessageBodyMarkdown = "test".repeat(80) as MessageBodyMarkdown;

export const aMessageContent: MessageContent = {
  markdown: aMessageBodyMarkdown,
  subject: "test".repeat(10) as MessageSubject
};

export const aPaymentData = pipe(
  {
    amount: 100,
    notice_number: "177777777777777777",
    payee: {
      fiscal_code: anOrganizationFiscalCode
    }
  },
  PaymentData.decode,
  E.getOrElseW(errors => {
    throw Error(`Malformed Payee in __mocks__: ${errorsToError(errors)}`);
  })
);

export const aPaymentMessageContent: MessageContent = {
  markdown: aMessageBodyMarkdown,
  payment_data: aPaymentData,
  subject: "test".repeat(10) as MessageSubject
};

export const aSerializedNewMessageWithContent = {
  content: aMessageContent,
  createdAt: new Date().toISOString(),
  fiscalCode: aFiscalCode,
  id: "A_MESSAGE_ID" as NonEmptyString,
  indexedId: "A_MESSAGE_ID" as NonEmptyString,
  senderServiceId: "agid" as ServiceId,
  senderUserId: "u123" as NonEmptyString,
  timeToLiveSeconds: 3600 as TimeToLiveSeconds
};

export const aNewMessageWithoutContent: NewMessageWithoutContent = {
  createdAt: new Date(),
  featureLevelType: FeatureLevelTypeEnum.STANDARD,
  fiscalCode: aFiscalCode,
  id: "A_MESSAGE_ID" as NonEmptyString,
  indexedId: "A_MESSAGE_ID" as NonEmptyString,
  kind: "INewMessageWithoutContent",
  senderServiceId: "agid" as ServiceId,
  senderUserId: "u123" as NonEmptyString,
  timeToLiveSeconds: 3600 as TimeToLiveSeconds
};

export const aCreatedMessageEventSenderMetadata: CreatedMessageEventSenderMetadata =
  {
    departmentName: "aDepartmentName" as NonEmptyString,
    organizationFiscalCode: "01234567890" as OrganizationFiscalCode,
    organizationName: "An Organization Name" as NonEmptyString,
    requireSecureChannels: false,
    serviceCategory: StandardServiceCategoryEnum.STANDARD,
    serviceName: "A_SERVICE_NAME" as NonEmptyString,
    serviceUserEmail: "aaa@mail.com" as EmailString
  };
export const aRetrievedServicePreference: ServicePreference = {
  accessReadMessageStatus: AccessReadMessageStatusEnum.UNKNOWN,
  fiscalCode: aFiscalCode,
  isEmailEnabled: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  serviceId: aServiceId,
  settingsVersion: 0 as NonNegativeInteger
};

export const anEnabledServicePreference: ServicePreference = {
  accessReadMessageStatus: AccessReadMessageStatusEnum.UNKNOWN,
  fiscalCode: aFiscalCode,
  isEmailEnabled: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  serviceId: "01234567890" as NonEmptyString,
  settingsVersion: 0 as NonNegativeInteger
};

export const aDisabledServicePreference: ServicePreference = {
  accessReadMessageStatus: AccessReadMessageStatusEnum.UNKNOWN,
  fiscalCode: aFiscalCode,
  isEmailEnabled: false,
  isInboxEnabled: false,
  isWebhookEnabled: false,
  serviceId: "01234567890" as NonEmptyString,
  settingsVersion: 0 as NonNegativeInteger
};

export const aMessagePayload = {
  content: {
    markdown: "A message body markdown".repeat(40) as MessageBodyMarkdown,
    subject: "A new message subject" as MessageSubject
  },
  time_to_live: 3600
};

export const aMessageContentWithLegalData: MessageContent = {
  ...aMessagePayload.content,
  legal_data: {
    has_attachment: false,
    message_unique_id: "A_MESSAGE_UNIQUE_ID" as NonEmptyString,
    sender_mail_from: "demo@pec.it" as NonEmptyString
  }
};

export const aMessagePayloadWithLegalData = {
  content: {
    ...aMessageContentWithLegalData
  },
  time_to_live: 3600
};

export const anActivation: RetrievedActivation = {
  ...aCosmosResourceMetadata,
  fiscalCode: aFiscalCode,
  id: generateComposedVersionedModelId<
    Activation,
    typeof ACTIVATION_REFERENCE_ID_FIELD,
    typeof ACTIVATION_MODEL_PK_FIELD
  >(aServiceId, aFiscalCode, 1 as NonNegativeInteger),
  kind: "IRetrievedActivation",
  serviceId: aServiceId,
  status: ActivationStatusEnum.ACTIVE,
  version: 1 as NonNegativeInteger
};

export const aMessageId = "A_MESSAGE_ID" as NonEmptyString;
export const aRetrievedMessageStatus: RetrievedMessageStatus = {
  ...aCosmosResourceMetadata,
  fiscalCode: aFiscalCode,
  id: aMessageId,
  isArchived: false,
  isRead: false,
  kind: "IRetrievedMessageStatus",
  messageId: aMessageId,
  status: NotRejectedMessageStatusValueEnum.PROCESSED,
  updatedAt: new Date(),
  version: 0 as NonNegativeInteger
};
