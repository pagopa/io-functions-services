/* eslint-disable sort-keys */
import {
  EmailString,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import { CIDR } from "@pagopa/io-functions-commons/dist/generated/definitions/CIDR";
import {
  NonNegativeInteger,
  WithinRangeInteger
} from "@pagopa/ts-commons/lib/numbers";
import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { StandardServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/StandardServiceCategory";
import { ServicesPreferencesModeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import { ValidService } from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  Profile,
  PROFILE_SERVICE_PREFERENCES_SETTINGS_LEGACY_VERSION
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { ServicePreference } from "@pagopa/io-functions-commons/dist/src/models/service_preference";

export const aLegacyInboxEnabledFiscalCode = "AAABBB01C02D345L" as FiscalCode;
export const aLegacyInboxDisabledFiscalCode = "AAABBB01C02D345I" as FiscalCode;
export const anAutoFiscalCode = "AAABBB01C02D345A" as FiscalCode;
export const aManualFiscalCode = "AAABBB01C02D345M" as FiscalCode;

export const anEnabledServiceId = "anEnabledServiceId" as NonEmptyString;
export const anEnabledServiceWithEmailId = "anEnabledServiceWithEmailId" as NonEmptyString;
export const aDisabledServiceId = "aDisabledServiceId" as NonEmptyString;
export const aValidServiceId = "aValidServiceId" as NonEmptyString;
export const aValidServiceWithoutWriteMessageGroupsId = "aValidServiceWithoutWriteMessageGroupsId" as NonEmptyString;

// ---------------------------------
// Services
// ---------------------------------

const anEnabledService: ValidService = {
  serviceId: anEnabledServiceId,
  authorizedRecipients: new Set([
    aLegacyInboxEnabledFiscalCode,
    anAutoFiscalCode
  ]),
  authorizedCIDRs: new Set((["0.0.0.0"] as unknown) as ReadonlyArray<CIDR>),
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

const aValidService: ValidService = {
  ...anEnabledService,
  serviceId: aValidServiceId
};

const aValidServiceWithoutWriteMessageGroups: ValidService = {
  ...anEnabledService,
  serviceId: aValidServiceWithoutWriteMessageGroupsId
};

const anEnabledServiceWithEmail: ValidService = {
  serviceId: anEnabledServiceWithEmailId,
  authorizedRecipients: new Set([
    aLegacyInboxEnabledFiscalCode,
    anAutoFiscalCode
  ]),
  authorizedCIDRs: new Set((["0.0.0.0"] as unknown) as ReadonlyArray<CIDR>),
  departmentName: "department" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: (0 as unknown) as number &
    WithinRangeInteger<0, 9999999999>,
  organizationFiscalCode: "01234567890" as OrganizationFiscalCode,
  organizationName: "Organization" as NonEmptyString,
  requireSecureChannels: false,
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

const aDisabledService: ValidService = {
  serviceId: aDisabledServiceId,
  authorizedRecipients: new Set([
    aLegacyInboxEnabledFiscalCode,
    anAutoFiscalCode
  ]),
  authorizedCIDRs: new Set((["0.0.0.0"] as unknown) as ReadonlyArray<CIDR>),
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

// ---------------------------------
// Profiles
// ---------------------------------

const legacyProfileInboxEnabled: Profile = {
  acceptedTosVersion: 2,
  email: "fake-email@fake.it" as EmailString,
  fiscalCode: aLegacyInboxEnabledFiscalCode,
  isEmailEnabled: true,
  isEmailValidated: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  blockedInboxOrChannels: {
    [aDisabledServiceId]: [BlockedInboxOrChannelEnum.INBOX]
  },
  servicePreferencesSettings: {
    mode: ServicesPreferencesModeEnum.LEGACY,
    version: PROFILE_SERVICE_PREFERENCES_SETTINGS_LEGACY_VERSION
  }
};

const legacyProfileInboxDisabled: Profile = {
  acceptedTosVersion: 2,
  email: "fake-email@fake.it" as EmailString,
  fiscalCode: aLegacyInboxDisabledFiscalCode,
  isEmailEnabled: true,
  isEmailValidated: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  blockedInboxOrChannels: {},
  servicePreferencesSettings: {
    mode: ServicesPreferencesModeEnum.LEGACY,
    version: PROFILE_SERVICE_PREFERENCES_SETTINGS_LEGACY_VERSION
  }
};

const autoProfile: Profile = {
  acceptedTosVersion: 2,
  email: "fake-email@fake.it" as EmailString,
  fiscalCode: anAutoFiscalCode,
  isEmailEnabled: true,
  isEmailValidated: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  blockedInboxOrChannels: {},
  servicePreferencesSettings: {
    mode: ServicesPreferencesModeEnum.AUTO,
    version: 1 as NonNegativeInteger
  }
};

const manualProfile: Profile = {
  acceptedTosVersion: 2,
  email: "fake-email@fake.it" as EmailString,
  fiscalCode: aManualFiscalCode,
  isEmailEnabled: true,
  isEmailValidated: true,
  isInboxEnabled: true,
  isWebhookEnabled: true,
  blockedInboxOrChannels: {},
  servicePreferencesSettings: {
    mode: ServicesPreferencesModeEnum.MANUAL,
    version: 1 as NonNegativeInteger
  }
};

// ---------------------------------

const anAutoServicePreferencesDisabled: ServicePreference = {
  fiscalCode: anAutoFiscalCode,
  serviceId: aDisabledServiceId,
  isInboxEnabled: false,
  isEmailEnabled: false,
  isWebhookEnabled: false,
  settingsVersion: 1 as NonNegativeInteger
};

const aManualServicePreferencesEnable: ServicePreference = {
  fiscalCode: aManualFiscalCode,
  serviceId: anEnabledServiceId,
  isInboxEnabled: true,
  isEmailEnabled: true,
  isWebhookEnabled: true,
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
  aManualServicePreferencesEnable
];
