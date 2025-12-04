import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { CIDR } from "@pagopa/io-functions-commons/dist/generated/definitions/CIDR";
import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import { ServicesPreferencesModeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import { StandardServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/StandardServiceCategory";
import {
  Profile,
  PROFILE_SERVICE_PREFERENCES_SETTINGS_LEGACY_VERSION
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import { ValidService } from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  AccessReadMessageStatusEnum,
  ServicePreference
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import {
  NonNegativeInteger,
  WithinRangeInteger
} from "@pagopa/ts-commons/lib/numbers";
import {
  EmailString,
  NonEmptyString,
  OrganizationFiscalCode,
  Semver
} from "@pagopa/ts-commons/lib/strings";

export const aLegacyInboxEnabledFiscalCode = "AAABBB01C02D345L" as FiscalCode;
export const aLegacyInboxDisabledFiscalCode = "AAABBB01C02D345I" as FiscalCode;
export const anAutoFiscalCode = "AAABBB01C02D345A" as FiscalCode;
export const aManualFiscalCode = "AAABBB01C02D345M" as FiscalCode;

export const anEnabledServiceId = "anEnabledServiceId" as NonEmptyString;
export const anEnabledServiceWithEmailId =
  "anEnabledServiceWithEmailId" as NonEmptyString;
export const aDisabledServiceId = "aDisabledServiceId" as NonEmptyString;
export const aValidServiceId = "aValidServiceId" as NonEmptyString;
export const aValidServiceWithoutWriteMessageGroupsId =
  "aValidServiceWithoutWriteMessageGroupsId" as NonEmptyString;

// ---------------------------------
// Services
// ---------------------------------

const anEnabledService: ValidService = {
  authorizedCIDRs: new Set(["0.0.0.0"] as unknown as readonly CIDR[]),
  authorizedRecipients: new Set([
    aLegacyInboxEnabledFiscalCode,
    anAutoFiscalCode
  ]),
  departmentName: "department" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: 10 as unknown as number &
    WithinRangeInteger<0, 9999999999>,
  organizationFiscalCode: "01234567890" as OrganizationFiscalCode,
  organizationName: "Organization" as NonEmptyString,
  requireSecureChannels: true,
  serviceId: anEnabledServiceId,
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

const aValidService: ValidService = {
  ...anEnabledService,
  serviceId: aValidServiceId
};

const aValidServiceWithoutWriteMessageGroups: ValidService = {
  ...anEnabledService,
  serviceId: aValidServiceWithoutWriteMessageGroupsId
};

const anEnabledServiceWithEmail: ValidService = {
  authorizedCIDRs: new Set(["0.0.0.0"] as unknown as readonly CIDR[]),
  authorizedRecipients: new Set([
    aLegacyInboxEnabledFiscalCode,
    anAutoFiscalCode
  ]),
  departmentName: "department" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: 0 as unknown as number &
    WithinRangeInteger<0, 9999999999>,
  organizationFiscalCode: "01234567890" as OrganizationFiscalCode,
  organizationName: "Organization" as NonEmptyString,
  requireSecureChannels: false,
  serviceId: anEnabledServiceWithEmailId,
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

const aDisabledService: ValidService = {
  authorizedCIDRs: new Set(["0.0.0.0"] as unknown as readonly CIDR[]),
  authorizedRecipients: new Set([
    aLegacyInboxEnabledFiscalCode,
    anAutoFiscalCode
  ]),
  departmentName: "department" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: 0 as unknown as number &
    WithinRangeInteger<0, 9999999999>,
  organizationFiscalCode: "01234567890" as OrganizationFiscalCode,
  organizationName: "Organization" as NonEmptyString,
  requireSecureChannels: true,
  serviceId: aDisabledServiceId,
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

// ---------------------------------
// Profiles
// ---------------------------------

const legacyProfileInboxEnabled: Profile = {
  acceptedTosVersion: 2,
  blockedInboxOrChannels: {
    [aDisabledServiceId]: [BlockedInboxOrChannelEnum.INBOX]
  },
  email: "fake-email@fake.it" as EmailString,
  fiscalCode: aLegacyInboxEnabledFiscalCode,
  isEmailEnabled: true,
  isEmailValidated: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  servicePreferencesSettings: {
    mode: ServicesPreferencesModeEnum.LEGACY,
    version: PROFILE_SERVICE_PREFERENCES_SETTINGS_LEGACY_VERSION
  }
};

const legacyProfileInboxDisabled: Profile = {
  acceptedTosVersion: 2,
  blockedInboxOrChannels: {},
  email: "fake-email@fake.it" as EmailString,
  fiscalCode: aLegacyInboxDisabledFiscalCode,
  isEmailEnabled: true,
  isEmailValidated: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  servicePreferencesSettings: {
    mode: ServicesPreferencesModeEnum.LEGACY,
    version: PROFILE_SERVICE_PREFERENCES_SETTINGS_LEGACY_VERSION
  }
};

const autoProfile: Profile = {
  acceptedTosVersion: 2,
  blockedInboxOrChannels: {},
  email: "fake-email@fake.it" as EmailString,
  fiscalCode: anAutoFiscalCode,
  isEmailEnabled: true,
  isEmailValidated: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  lastAppVersion: process.env.MIN_APP_VERSION_WITH_READ_AUTH as Semver,
  servicePreferencesSettings: {
    mode: ServicesPreferencesModeEnum.AUTO,
    version: 1 as NonNegativeInteger
  }
};

const manualProfile: Profile = {
  acceptedTosVersion: 2,
  blockedInboxOrChannels: {},
  email: "fake-email@fake.it" as EmailString,
  fiscalCode: aManualFiscalCode,
  isEmailEnabled: true,
  isEmailValidated: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  lastAppVersion: process.env.MIN_APP_VERSION_WITH_READ_AUTH as Semver,
  servicePreferencesSettings: {
    mode: ServicesPreferencesModeEnum.MANUAL,
    version: 1 as NonNegativeInteger
  }
};

// ---------------------------------

const anAutoServicePreferencesDisabled: ServicePreference = {
  accessReadMessageStatus: AccessReadMessageStatusEnum.UNKNOWN,
  fiscalCode: anAutoFiscalCode,
  isEmailEnabled: false,
  isInboxEnabled: false,
  isWebhookEnabled: false,
  serviceId: aDisabledServiceId,
  settingsVersion: 1 as NonNegativeInteger
};

const anAutoServicePreferencesEnabledWithReadAuthUnknown: ServicePreference = {
  accessReadMessageStatus: AccessReadMessageStatusEnum.UNKNOWN,
  fiscalCode: anAutoFiscalCode,
  isEmailEnabled: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  serviceId: anEnabledServiceId,
  settingsVersion: 1 as NonNegativeInteger
};

const anAutoServicePreferencesEnabledWithReadAuthDeny: ServicePreference = {
  accessReadMessageStatus: AccessReadMessageStatusEnum.DENY,
  fiscalCode: anAutoFiscalCode,
  isEmailEnabled: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  serviceId: aValidServiceId,
  settingsVersion: 1 as NonNegativeInteger
};

const aManualServicePreferencesEnable: ServicePreference = {
  accessReadMessageStatus: AccessReadMessageStatusEnum.UNKNOWN,
  fiscalCode: aManualFiscalCode,
  isEmailEnabled: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  serviceId: anEnabledServiceId,
  settingsVersion: 1 as NonNegativeInteger
};

// ---------------------------------
// Exported data
// ---------------------------------

export const aValidServiceList = [
  anEnabledService,
  aValidService,
  aValidServiceWithoutWriteMessageGroups,
  anEnabledServiceWithEmail,
  aDisabledService
];
export const aValidProfileList = [
  legacyProfileInboxEnabled,
  legacyProfileInboxDisabled,
  autoProfile,
  manualProfile
];

export const aValidServicePreferenceList = [
  anAutoServicePreferencesDisabled,
  aManualServicePreferencesEnable,
  anAutoServicePreferencesEnabledWithReadAuthUnknown,
  anAutoServicePreferencesEnabledWithReadAuthDeny
];
