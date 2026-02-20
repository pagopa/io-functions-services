import * as healthcheck from "@pagopa/io-functions-commons/dist/src/utils/healthcheck";
import { toHealthProblems } from "@pagopa/io-functions-commons/dist/src/utils/healthcheck";
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import * as packageJson from "../package.json";
import { envConfig, IConfig } from "../utils/config";

type HealthChecker = (
  config: unknown
) => healthcheck.HealthCheck<
  "AzureCosmosDB" | "AzureStorage" | "Config" | "Url",
  true
>;

interface IInfo {
  readonly name: string;
  readonly version: string;
}

type InfoHandler = () => Promise<
  IResponseErrorInternal | IResponseSuccessJson<IInfo>
>;

export function Info() {
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
      c =>
        pipe(
          TE.tryCatch(
            () => fetch(`${c.SENDING_FUNC_API_URL}/api/v1/info`),
            toHealthProblems("Url" as const)
          ),
          TE.map(() => true)
        )
    ])
  );

  return wrapHandlerV4([] as const, handler);
}

export function InfoHandler(healthCheck: HealthChecker): InfoHandler {
  return () =>
    pipe(
      envConfig,
      healthCheck,
      TE.mapLeft(problems => ResponseErrorInternal(problems.join("\n\n"))),
      TE.map(() =>
        ResponseSuccessJson({
          name: packageJson.name,
          version: packageJson.version
        })
      ),
      TE.toUnion
    )();
}
