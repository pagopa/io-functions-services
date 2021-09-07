import { CosmosClient } from "@azure/cosmos";
import {
  common as azurestorageCommon,
  createBlobService,
  createFileService,
  createQueueService,
  createTableService
} from "azure-storage";
import * as AP from "fp-ts/lib/Apply";
import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import fetch from "node-fetch";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";
import { getConfig, IConfig } from "./config";

type ProblemSource = "AzureCosmosDB" | "AzureStorage" | "Config" | "Url";
export type HealthProblem<S extends ProblemSource> = string & {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  readonly __source: S;
};
export type HealthCheck<
  S extends ProblemSource = ProblemSource,
  T = true
> = TaskEither<ReadonlyArray<HealthProblem<S>>, T>;

// format and cast a problem message with its source
const formatProblem = <S extends ProblemSource>(
  source: S,
  message: string
): HealthProblem<S> => `${source}|${message}` as HealthProblem<S>;

// utility to format an unknown error to an arry of HealthProblem
const toHealthProblems = <S extends ProblemSource>(source: S) => (
  e: unknown
): ReadonlyArray<HealthProblem<S>> => [
  formatProblem(source, E.toError(e).message)
];

/**
 * Check application's configuration is correct
 *
 * @returns either true or an array of error messages
 */
export const checkConfigHealth = (): HealthCheck<"Config", IConfig> =>
  pipe(
    getConfig(),
    TE.fromEither,
    TE.mapLeft(errors =>
      errors.map(e =>
        // give each problem its own line
        formatProblem("Config", readableReport([e]))
      )
    )
  );

/**
 * Check the application can connect to an Azure CosmosDb instances
 *
 * @param dbUri uri of the database
 * @param dbUri connection string for the storage
 *
 * @returns either true or an array of error messages
 */
export const checkAzureCosmosDbHealth = (
  dbUri: string,
  dbKey?: string
): HealthCheck<"AzureCosmosDB", true> =>
  pipe(
    TE.tryCatch(() => {
      const client = new CosmosClient({
        endpoint: dbUri,
        key: dbKey
      });
      return client.getDatabaseAccount();
    }, toHealthProblems("AzureCosmosDB")),
    TE.map(_ => true)
  );

/**
 * Check the application can connect to an Azure Storage
 *
 * @param connStr connection string for the storage
 *
 * @returns either true or an array of error messages
 */
export const checkAzureStorageHealth = (
  connStr: string
): HealthCheck<"AzureStorage"> =>
  pipe(
    A.sequence(TE.taskEither)(
      // try to instantiate a client for each product of azure storage
      [
        createBlobService,
        createFileService,
        createQueueService,
        createTableService
      ]
        // for each, create a task that wraps getServiceProperties
        .map(createService =>
          TE.tryCatch(
            () =>
              new Promise<
                azurestorageCommon.models.ServicePropertiesResult.ServiceProperties
              >((resolve, reject) =>
                createService(connStr).getServiceProperties((err, result) => {
                  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                  err
                    ? reject(err.message.replace(/\n/gim, " ")) // avoid newlines
                    : resolve(result);
                })
              ),
            toHealthProblems("AzureStorage")
          )
        )
    ),
    TE.map(_ => true)
  );

/**
 * Check a url is reachable
 *
 * @param url url to connect with
 *
 * @returns either true or an array of error messages
 */
export const checkUrlHealth = (url: string): HealthCheck<"Url", true> =>
  pipe(
    TE.tryCatch(() => fetch(url, { method: "HEAD" }), toHealthProblems("Url")),
    TE.map(_ => true)
  );

/**
 * Execute all the health checks for the application
 *
 * @returns either true or an array of error messages
 */
export const checkApplicationHealth = (): HealthCheck<ProblemSource, true> =>
  pipe(
    TE.of<ReadonlyArray<HealthProblem<ProblemSource>>, void>(void 0),
    TE.chain(_ => checkConfigHealth()),
    TE.chain(config =>
      // TODO: once we upgrade to fp-ts >= 1.19 we can use Validation to collect all errors, not just the first to happen
      AP.sequenceT(TE.taskEither)<
        ReadonlyArray<HealthProblem<ProblemSource>>,
        // eslint-disable-next-line functional/prefer-readonly-type
        Array<TaskEither<ReadonlyArray<HealthProblem<ProblemSource>>, true>>
      >(
        checkAzureCosmosDbHealth(config.COSMOSDB_URI, config.COSMOSDB_KEY),
        checkAzureStorageHealth(config.QueueStorageConnection),
        checkUrlHealth(config.WEBHOOK_CHANNEL_URL)
      )
    ),
    TE.map(_ => true)
  );
