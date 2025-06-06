/* eslint-disable @typescript-eslint/explicit-function-return-type */
import * as healthcheck from "@pagopa/io-functions-commons/dist/src/utils/healthcheck";
import { toHealthProblems } from "@pagopa/io-functions-commons/dist/src/utils/healthcheck";
import { wrapRequestHandler } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import * as express from "express";
import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";

import * as packageJson from "../package.json";
import { IConfig, envConfig } from "../utils/config";

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

export function InfoHandler(healthCheck: HealthChecker): InfoHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return () =>
    pipe(
      envConfig,
      healthCheck,
      TE.mapLeft((problems) => ResponseErrorInternal(problems.join("\n\n"))),
      TE.map(() =>
        ResponseSuccessJson({
          name: packageJson.name,
          version: packageJson.version
        })
      ),
      TE.toUnion
    )();
}

export function Info(): express.RequestHandler {
  const handler = InfoHandler(
    healthcheck.checkApplicationHealth(IConfig, [
      (c) =>
        healthcheck.checkAzureCosmosDbHealth(c.COSMOSDB_URI, c.COSMOSDB_KEY),
      (c) =>
        healthcheck.checkAzureStorageHealth(
          c.MESSAGE_CONTENT_STORAGE_CONNECTION_STRING
        ),
      (c) =>
        healthcheck.checkAzureStorageHealth(
          c.SUBSCRIPTION_FEED_STORAGE_CONNECTION_STRING
        ),
      (c) =>
        healthcheck.checkAzureStorageHealth(
          c.INTERNAL_STORAGE_CONNECTION_STRING
        ),
      (c) =>
        pipe(
          TE.tryCatch(
            () => fetch(`${c.SENDING_FUNC_API_URL}/api/v1/info`),
            toHealthProblems("Url")
          ),
          TE.map(() => true)
        )
    ])
  );

  return wrapRequestHandler(handler);
}
