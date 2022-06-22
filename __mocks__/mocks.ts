import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import { ServicesPreferencesModeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
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

import { MessageBodyMarkdown } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageBodyMarkdown";
import { MessageSubject } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageSubject";

import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";

import {
  NewMessageWithoutContent,
  RetrievedMessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";
import { CreatedMessageEventSenderMetadata } from "@pagopa/io-functions-commons/dist/src/models/created_message_sender_metadata";
import { StandardServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/StandardServiceCategory";

import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { CIDR } from "@pagopa/io-functions-commons/dist/generated/definitions/CIDR";
import {
  Activation,
  ACTIVATION_MODEL_PK_FIELD,
  ACTIVATION_REFERENCE_ID_FIELD,
  RetrievedActivation
} from "@pagopa/io-functions-commons/dist/src/models/activation";
import { ActivationStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ActivationStatus";
import { generateComposedVersionedModelId } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model_composed_versioned";
import { RetrievedMessageStatus } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { MessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { FeatureLevelTypeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/FeatureLevelType";

export const aFiscalCode = "AAABBB01C02D345D" as FiscalCode;
export const anotherFiscalCode = "AAABBB01C02D345W" as FiscalCode;

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
  serviceId: aServiceId,
  authorizedRecipients: new Set([aFiscalCode, anotherFiscalCode]),
  authorizedCIDRs: new Set((["0.0.0.0"] as unknown) as CIDR[]),
  departmentName: "department" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: (0 as unknown) as number &
    WithinRangeInteger<0, 9999999999>,
  organizationFiscalCode: "01234567890" as OrganizationFiscalCode,
  organizationName: "Organization" as NonEmptyString,
  requireSecureChannels: true,
  serviceName: "Service" as NonEmptyString,
  serviceMetadata: {
    description: "Service Description" as NonEmptyString,
    privacyUrl: "https://example.com/privacy.html" as NonEmptyString,
    supportUrl: "https://example.com/support.html" as NonEmptyString,
    scope: ServiceScopeEnum.NATIONAL,
    category: StandardServiceCategoryEnum.STANDARD,
    customSpecialFlow: undefined
  }
};

export const anIncompleteService: Service & {
  readonly version: NonNegativeInteger;
} = {
  serviceId: aServiceId,
  authorizedRecipients: new Set([aFiscalCode, anotherFiscalCode]),
  authorizedCIDRs: new Set((["0.0.0.0"] as unknown) as CIDR[]),
  departmentName: "department" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: (0 as unknown) as number &
    WithinRangeInteger<0, 9999999999>,
  organizationFiscalCode: "01234567890" as OrganizationFiscalCode,
  organizationName: "Organization" as NonEmptyString,
  requireSecureChannels: true,
  serviceName: "Service" as NonEmptyString,
  serviceMetadata: {
    description: "Service Description" as NonEmptyString,
    scope: ServiceScopeEnum.NATIONAL,
    category: StandardServiceCategoryEnum.STANDARD,
    customSpecialFlow: undefined
  },
  version: 1 as NonNegativeInteger
};

export const anAzureApiAuthorization: IAzureApiAuthorization = {
  kind: "IAzureApiAuthorization",
  groups: new Set([UserGroup.ApiLimitedProfileRead, UserGroup.ApiMessageWrite]),
  userId: "01234567890" as NonEmptyString,
  subscriptionId: "abcdefghi" as NonEmptyString
};

export const anAzureUserAttributes: IAzureUserAttributes = {
  kind: "IAzureUserAttributes",
  email: "foo@example.com" as EmailString,
  service: { ...aValidService, version: 0 as NonNegativeInteger }
};

export const legacyProfileServicePreferencesSettings: RetrievedProfile["servicePreferencesSettings"] = {
  mode: ServicesPreferencesModeEnum.LEGACY,
  version: -1
};

export const autoProfileServicePreferencesSettings: RetrievedProfile["servicePreferencesSettings"] = {
  mode: ServicesPreferencesModeEnum.AUTO,
  version: 0 as NonNegativeInteger
};

export const manualProfileServicePreferencesSettings: RetrievedProfile["servicePreferencesSettings"] = {
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
  servicePreferencesSettings: legacyProfileServicePreferencesSettings,
  version: 0 as NonNegativeInteger,
  lastAppVersion: "UNKNOWN"
};

export const aRetrievedMessage: RetrievedMessageWithoutContent = {
  ...aCosmosResourceMetadata,
  createdAt: new Date(),
  featureLevelType: FeatureLevelTypeEnum.STANDARD,
  fiscalCode: aFiscalCode,
  id: "A_MESSAGE_ID" as NonEmptyString,
  kind: "IRetrievedMessageWithoutContent",
  indexedId: "AN_INDEXED_ID" as NonEmptyString,
  senderServiceId: "01234567890" as NonEmptyString,
  senderUserId: "A_USER_ID" as NonEmptyString,
  timeToLiveSeconds: 604800
};

export const aMessageBodyMarkdown = "test".repeat(80) as MessageBodyMarkdown;

export const aMessageContent: MessageContent = {
  markdown: aMessageBodyMarkdown,
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
  senderServiceId: "agid" as ServiceId,
  senderUserId: "u123" as NonEmptyString,
  timeToLiveSeconds: 3600 as TimeToLiveSeconds,
  kind: "INewMessageWithoutContent"
};

export const aCreatedMessageEventSenderMetadata: CreatedMessageEventSenderMetadata = {
  departmentName: "aDepartmentName" as NonEmptyString,
  organizationFiscalCode: "01234567890" as OrganizationFiscalCode,
  organizationName: "An Organization Name" as NonEmptyString,
  requireSecureChannels: false,
  serviceCategory: StandardServiceCategoryEnum.STANDARD,
  serviceName: "A_SERVICE_NAME" as NonEmptyString,
  serviceUserEmail: "aaa@mail.com" as EmailString
};
export const aRetrievedServicePreference: ServicePreference = {
  fiscalCode: aFiscalCode,
  isEmailEnabled: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  serviceId: aServiceId,
  settingsVersion: 0 as NonNegativeInteger,
  accessReadMessageStatus: AccessReadMessageStatusEnum.UNKNOWN
};

export const anEnabledServicePreference: ServicePreference = {
  fiscalCode: aFiscalCode,
  isEmailEnabled: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  serviceId: "01234567890" as NonEmptyString,
  settingsVersion: 0 as NonNegativeInteger,
  accessReadMessageStatus: AccessReadMessageStatusEnum.UNKNOWN
};

export const aDisabledServicePreference: ServicePreference = {
  fiscalCode: aFiscalCode,
  isEmailEnabled: false,
  isInboxEnabled: false,
  isWebhookEnabled: false,
  serviceId: "01234567890" as NonEmptyString,
  settingsVersion: 0 as NonNegativeInteger,
  accessReadMessageStatus: AccessReadMessageStatusEnum.UNKNOWN
};

export const aMessagePayload = {
  content: {
    subject: "A new message subject" as MessageSubject,
    markdown: "A message body markdown".repeat(40) as MessageBodyMarkdown
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
  id: generateComposedVersionedModelId<
    Activation,
    typeof ACTIVATION_REFERENCE_ID_FIELD,
    typeof ACTIVATION_MODEL_PK_FIELD
  >(aServiceId, aFiscalCode, 1 as NonNegativeInteger),
  fiscalCode: aFiscalCode,
  serviceId: aServiceId,
  status: ActivationStatusEnum.ACTIVE,
  version: 1 as NonNegativeInteger,
  kind: "IRetrievedActivation"
};

export const aMessageId = "A_MESSAGE_ID" as NonEmptyString;
export const aRetrievedMessageStatus: RetrievedMessageStatus = {
  ...aCosmosResourceMetadata,
  kind: "IRetrievedMessageStatus",
  id: aMessageId,
  version: 0 as NonNegativeInteger,
  messageId: aMessageId,
  status: MessageStatusValueEnum.PROCESSED,
  updatedAt: new Date(),
  isRead: false,
  isArchived: false,
  fiscalCode: aFiscalCode
};
