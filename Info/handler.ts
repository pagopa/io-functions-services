/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { wrapRequestHandler } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import * as express from "express";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";

import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";

import * as healthcheck from "@pagopa/io-functions-commons/dist/src/utils/healthcheck";
import * as packageJson from "../package.json";
import { envConfig, IConfig } from "../utils/config";

interface IInfo {
  readonly name: string;
  readonly version: string;
}

type InfoHandler = () => Promise<
  IResponseSuccessJson<IInfo> | IResponseErrorInternal
>;

type HealthChecker = (
  config: unknown
) => healthcheck.HealthCheck<
  "AzureStorage" | "Config" | "AzureCosmosDB" | "Url",
  true
>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function InfoHandler(healthCheck: HealthChecker): InfoHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return () =>
    pipe(
      envConfig,
      healthCheck,
      TE.mapLeft(problems => ResponseErrorInternal(problems.join("\n\n"))),
      TE.map(_ =>
        ResponseSuccessJson({
          name: packageJson.name,
          version: packageJson.version
        })
      ),
      TE.toUnion
    )();
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function Info(): express.RequestHandler {
  const handler = InfoHandler(
    healthcheck.checkApplicationHealth(IConfig, [
      c => healthcheck.checkAzureCosmosDbHealth(c.COSMOSDB_URI, c.COSMOSDB_KEY),
      c =>
        healthcheck.checkAzureStorageHealth(
          c.MESSAGE_CONTENT_STORAGE_CONNECTION_STRING
        ),
      c =>
        healthcheck.checkAzureStorageHealth(
          c.SUBSCRIPTION_FEED_STORAGE_CONNECTION_STRING
        ),
      c =>
        healthcheck.checkAzureStorageHealth(
          c.INTERNAL_STORAGE_CONNECTION_STRING
        ),
      c => healthcheck.checkUrlHealth(c.WEBHOOK_CHANNEL_URL)
    ])
  );

  return wrapRequestHandler(handler);
}
