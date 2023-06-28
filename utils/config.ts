/**
 * Config module
 *
 * Single point of access for the application confguration. Handles validation on required environment variables.
 * The configuration is evaluate eagerly at the first access to the module. The module exposes convenient methods to access such value.
 */

import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { MailerConfig } from "@pagopa/io-functions-commons/dist/src/mailer";
import * as O from "fp-ts/lib/Option";
import * as E from "fp-ts/lib/Either";
import * as t from "io-ts";
import { BooleanFromString, JsonFromString, withFallback } from "io-ts-types";

import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import {
  FiscalCode,
  NonEmptyString,
  Semver
} from "@pagopa/ts-commons/lib/strings";
import { DateFromTimestamp } from "@pagopa/ts-commons/lib/dates";
import {
  NonNegativeIntegerFromString,
  NumberFromString
} from "@pagopa/ts-commons/lib/numbers";
import { flow, pipe } from "fp-ts/lib/function";
import { CommaSeparatedListOf } from "./comma-separated-list";
import { FeatureFlag, FeatureFlagEnum } from "./featureFlag";

export const BetaUsers = t.readonlyArray(FiscalCode);
export type BetaUsers = t.TypeOf<typeof BetaUsers>;

export const BetaUsersFromString = withFallback(JsonFromString, []).pipe(
  BetaUsers
);

// used for internal job dispatch, temporary files, etc...
const InternalStorageAccount = t.interface({
  INTERNAL_STORAGE_CONNECTION_STRING: NonEmptyString,
  // queues for handling message processing jobs
  MESSAGE_CREATED_QUEUE_NAME: NonEmptyString,
  MESSAGE_PROCESSED_QUEUE_NAME: NonEmptyString,
  NOTIFICATION_CREATED_EMAIL_QUEUE_NAME: NonEmptyString,
  NOTIFICATION_CREATED_WEBHOOK_QUEUE_NAME: NonEmptyString,
  // a blob container to keep temporary message processing data
  PROCESSING_MESSAGE_CONTAINER_NAME: NonEmptyString
});

// used to read and write message content on blob storage
const MessageContentStorageAccount = t.interface({
  MESSAGE_CONTAINER_NAME: NonEmptyString,
  MESSAGE_CONTENT_STORAGE_CONNECTION_STRING: NonEmptyString
});

// used to read and write subscription feed entries on table storage
const SubscriptionFeedStorageAccount = t.interface({
  SUBSCRIPTIONS_FEED_TABLE: NonEmptyString,
  SUBSCRIPTION_FEED_STORAGE_CONNECTION_STRING: NonEmptyString
});

// global app configuration
export type IConfig = t.TypeOf<typeof IConfig>;
export const IConfig = t.intersection([
  t.interface({
    APIM_BASE_URL: NonEmptyString,
    APIM_SUBSCRIPTION_KEY: NonEmptyString,

    APPINSIGHTS_INSTRUMENTATIONKEY: NonEmptyString,

    BETA_USERS: BetaUsersFromString,

    COSMOSDB_KEY: NonEmptyString,
    COSMOSDB_NAME: NonEmptyString,
    COSMOSDB_URI: NonEmptyString,

    DEFAULT_SUBSCRIPTION_PRODUCT_NAME: NonEmptyString,

    EMAIL_NOTIFICATION_SERVICE_BLACKLIST: CommaSeparatedListOf(ServiceId),

    FEATURE_FLAG: withFallback(FeatureFlag, FeatureFlagEnum.NONE),

    WEBHOOK_NOTIFICATION_SERVICE_BLACKLIST: CommaSeparatedListOf(ServiceId),
    // eslint-disable-next-line sort-keys
    IO_FUNCTIONS_ADMIN_API_TOKEN: NonEmptyString,
    IO_FUNCTIONS_ADMIN_BASE_URL: NonEmptyString,

    OPT_OUT_EMAIL_SWITCH_DATE: DateFromTimestamp,

    SANDBOX_FISCAL_CODE: NonEmptyString,

    WEBHOOK_CHANNEL_URL: NonEmptyString,

    // eslint-disable-next-line sort-keys
    FF_DISABLE_INCOMPLETE_SERVICES: t.boolean,
    FF_DISABLE_WEBHOOK_MESSAGE_CONTENT: t.boolean,
    FF_INCOMPLETE_SERVICE_WHITELIST: CommaSeparatedListOf(ServiceId),
    FF_OPT_IN_EMAIL_ENABLED: t.boolean,
    FF_PAYMENT_STATUS_ENABLED: withFallback(BooleanFromString, false),
    FF_TEMPLATE_EMAIL: withFallback(FeatureFlag, FeatureFlagEnum.NONE),

    PENDING_ACTIVATION_GRACE_PERIOD_SECONDS: t.number,

    PN_SERVICE_ID: withFallback(NonEmptyString, "0" as NonEmptyString),

    // eslint-disable-next-line sort-keys
    MIN_APP_VERSION_WITH_READ_AUTH: Semver,

    TTL_FOR_USER_NOT_FOUND: NonNegativeIntegerFromString,

    isProduction: t.boolean
  }),
  MessageContentStorageAccount,
  SubscriptionFeedStorageAccount,
  InternalStorageAccount,
  MailerConfig
]);

// Default value is expressed as a Unix timestamp so it can be safely compared with Cosmos timestamp
// This means that Date representation is in the past compared to the effectively switch Date we want to set
const DEFAULT_OPT_OUT_EMAIL_SWITCH_DATE = 1625781600;

// Default Special Service PENDING grace period is 1 day
export const DEFAULT_PENDING_ACTIVATION_GRACE_PERIOD_SECONDS = 24 * 60 * 60;

export const envConfig = {
  ...process.env,

  FF_DISABLE_INCOMPLETE_SERVICES: pipe(
    O.fromNullable(process.env.FF_DISABLE_INCOMPLETE_SERVICES),
    O.map(_ => _.toLowerCase() === "true"),
    O.getOrElse(() => false)
  ),
  FF_DISABLE_WEBHOOK_MESSAGE_CONTENT: pipe(
    O.fromNullable(process.env.FF_DISABLE_WEBHOOK_MESSAGE_CONTENT),
    O.map(_ => _.toLowerCase() === "true"),
    O.getOrElse(() => false)
  ),
  FF_OPT_IN_EMAIL_ENABLED: pipe(
    O.fromNullable(process.env.FF_OPT_IN_EMAIL_ENABLED),
    O.map(_ => _.toLocaleLowerCase() === "true"),
    O.getOrElse(() => false)
  ),
  OPT_OUT_EMAIL_SWITCH_DATE: pipe(
    E.fromNullable(DEFAULT_OPT_OUT_EMAIL_SWITCH_DATE)(
      process.env.OPT_OUT_EMAIL_SWITCH_DATE
    ),
    E.chain(
      flow(
        NumberFromString.decode,
        E.mapLeft(() => DEFAULT_OPT_OUT_EMAIL_SWITCH_DATE)
      )
    ),
    E.toUnion
  ),
  PENDING_ACTIVATION_GRACE_PERIOD_SECONDS: pipe(
    E.fromNullable(DEFAULT_PENDING_ACTIVATION_GRACE_PERIOD_SECONDS)(
      process.env.PENDING_ACTIVATION_GRACE_PERIOD_SECONDS
    ),
    E.chain(
      flow(
        NumberFromString.decode,
        E.mapLeft(() => DEFAULT_PENDING_ACTIVATION_GRACE_PERIOD_SECONDS)
      )
    ),
    E.toUnion
  ),
  isProduction: process.env.NODE_ENV === "production"
};

// No need to re-evaluate this object for each call
const errorOrConfig: t.Validation<IConfig> = IConfig.decode(envConfig);

/**
 * Read the application configuration and check for invalid values.
 * Configuration is eagerly evalued when the application starts.
 *
 * @returns either the configuration values or a list of validation errors
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getConfig(): t.Validation<IConfig> {
  return errorOrConfig;
}

/**
 * Read the application configuration and check for invalid values.
 * If the application is not valid, raises an exception.
 *
 * @returns the configuration values
 * @throws validation errors found while parsing the application configuration
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getConfigOrThrow(): IConfig {
  return pipe(
    errorOrConfig,
    E.getOrElse(errors => {
      throw new Error(`Invalid configuration: ${readableReport(errors)}`);
    })
  );
}
