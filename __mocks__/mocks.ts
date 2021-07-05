import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import {
  Service,
  ValidService
} from "@pagopa/io-functions-commons/dist/src/models/service";
import { CosmosResource } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
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
import { CIDR } from "../generated/definitions/CIDR";

import { MessageBodyMarkdown } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageBodyMarkdown"
import { MessageSubject } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageSubject"
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId"
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds"

import { NewMessageWithoutContent, RetrievedMessageWithoutContent } from "@pagopa/io-functions-commons/dist/src/models/message";
import { CreatedMessageEventSenderMetadata } from "@pagopa/io-functions-commons/dist/src/models/created_message_sender_metadata";
import { RetrievedProfile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import { ServicesPreferencesModeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";

export const aFiscalCode = "AAABBB01C02D345D" as FiscalCode;
export const anotherFiscalCode = "AAABBB01C02D345W" as FiscalCode;

// CosmosResourceMetadata
export const aCosmosResourceMetadata: Omit<CosmosResource, "id"> = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1
};

export const aValidService: ValidService = {
  serviceId: "01234567890" as NonEmptyString,
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
    scope: ServiceScopeEnum.NATIONAL
  }
};

export const anIncompleteService: Service & {
  readonly version: NonNegativeInteger;
} = {
  serviceId: "01234567890" as NonEmptyString,
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
    scope: ServiceScopeEnum.NATIONAL
  },
  version: 1 as NonNegativeInteger
};

export const legacyProfileServicePreferencesSettings: RetrievedProfile["servicePreferencesSettings"] = {
  mode: ServicesPreferencesModeEnum.LEGACY,
  version: -1
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
  version: 0 as NonNegativeInteger
};

export const aRetrievedMessage: RetrievedMessageWithoutContent = {
  ...aCosmosResourceMetadata,
  createdAt: new Date(),
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
  serviceName: "A_SERVICE_NAME" as NonEmptyString,
  serviceUserEmail: "aaa@mail.com" as EmailString
};