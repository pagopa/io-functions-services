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

export const aLegacyFiscalCode = "AAABBB01C02D345L" as FiscalCode;
export const anAutoFiscalCode = "AAABBB01C02D345A" as FiscalCode;

export const aValidServiceId = "aServiceId" as NonEmptyString;

// ---------------------------------
// Services
// ---------------------------------

const aValidService: ValidService = {
  serviceId: aValidServiceId,
  authorizedRecipients: new Set([aLegacyFiscalCode, anAutoFiscalCode]),
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

const legacyProfile: Profile = {
  acceptedTosVersion: 2,
  email: "fake-email@fake.it" as EmailString,
  fiscalCode: aLegacyFiscalCode,
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

// ---------------------------------
// Exported data
// ---------------------------------

export const aValidServiceList = [aValidService];
export const aValidProfileList = [legacyProfile, autoProfile];
