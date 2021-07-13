/**
 * Config module
 *
 * Single point of access for the application confguration. Handles validation on required environment variables.
 * The configuration is evaluate eagerly at the first access to the module. The module exposes convenient methods to access such value.
 */

import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { MailerConfig } from "@pagopa/io-functions-commons/dist/src/mailer";
import { fromNullable } from "fp-ts/lib/Option";
import { fromNullable as fromNullableE } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { DateFromTimestamp } from "@pagopa/ts-commons/lib/dates";
import { NumberFromString } from "@pagopa/ts-commons/lib/numbers";
import { identity } from "fp-ts/lib/function";
import { CommaSeparatedListOf } from "./comma-separated-list";

// global app configuration
export type IConfig = t.TypeOf<typeof IConfig>;
export const IConfig = t.intersection([
  t.interface({
    APPINSIGHTS_INSTRUMENTATIONKEY: NonEmptyString,

    COSMOSDB_KEY: NonEmptyString,
    COSMOSDB_NAME: NonEmptyString,
    COSMOSDB_URI: NonEmptyString,

    DEFAULT_SUBSCRIPTION_PRODUCT_NAME: NonEmptyString,

    EMAIL_NOTIFICATION_SERVICE_BLACKLIST: CommaSeparatedListOf(ServiceId),
    WEBHOOK_NOTIFICATION_SERVICE_BLACKLIST: CommaSeparatedListOf(ServiceId),

    // eslint-disable-next-line sort-keys
    IO_FUNCTIONS_ADMIN_API_TOKEN: NonEmptyString,
    IO_FUNCTIONS_ADMIN_BASE_URL: NonEmptyString,

    MESSAGE_CONTAINER_NAME: NonEmptyString,
    OPT_OUT_EMAIL_SWITCH_DATE: DateFromTimestamp,

    QueueStorageConnection: NonEmptyString,

    SANDBOX_FISCAL_CODE: NonEmptyString,
    SUBSCRIPTIONS_FEED_TABLE: NonEmptyString,

    WEBHOOK_CHANNEL_URL: NonEmptyString,

    // eslint-disable-next-line sort-keys
    FF_DISABLE_INCOMPLETE_SERVICES: t.boolean,
    FF_DISABLE_WEBHOOK_MESSAGE_CONTENT: t.boolean,
    FF_INCOMPLETE_SERVICE_WHITELIST: CommaSeparatedListOf(ServiceId),
    FF_OPT_IN_EMAIL_ENABLED: t.boolean,

    isProduction: t.boolean
  }),
  MailerConfig
]);

// Default value is expressed as a Unix timestamp so it can be safely compared with Cosmos timestamp
// This means that Date representation is in the past compared to the effectively switch Date we want to set
const DEFAULT_OPT_OUT_EMAIL_SWITCH_DATE = 1625781600;

// No need to re-evaluate this object for each call
const errorOrConfig: t.Validation<IConfig> = IConfig.decode({
  ...process.env,

  FF_DISABLE_INCOMPLETE_SERVICES: fromNullable(
    process.env.FF_DISABLE_INCOMPLETE_SERVICES
  )
    .map(_ => _.toLowerCase() === "true")
    .getOrElse(false),
  FF_DISABLE_WEBHOOK_MESSAGE_CONTENT: fromNullable(
    process.env.FF_DISABLE_WEBHOOK_MESSAGE_CONTENT
  )
    .map(_ => _.toLowerCase() === "true")
    .getOrElse(false),
  FF_OPT_IN_EMAIL_ENABLED: fromNullable(process.env.FF_OPT_IN_EMAIL_ENABLED)
    .map(_ => _.toLocaleLowerCase() === "true")
    .getOrElse(false),
  OPT_OUT_EMAIL_SWITCH_DATE: fromNullableE(DEFAULT_OPT_OUT_EMAIL_SWITCH_DATE)(
    process.env.OPT_OUT_EMAIL_SWITCH_DATE
  )
    .chain(_ =>
      NumberFromString.decode(_).mapLeft(
        () => DEFAULT_OPT_OUT_EMAIL_SWITCH_DATE
      )
    )
    .fold(identity, identity),
  isProduction: process.env.NODE_ENV === "production"
});

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
  return errorOrConfig.getOrElseL(errors => {
    throw new Error(`Invalid configuration: ${readableReport(errors)}`);
  });
}
