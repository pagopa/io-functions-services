/**
 * Insert fake data into CosmosDB database emulator.
 */
import {
  Container,
  CosmosClient,
  Database,
  IndexingPolicy
} from "@azure/cosmos";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

export const createDatabase = (
  client: CosmosClient,
  dbName: string
): TE.TaskEither<CosmosErrors, Database> =>
  pipe(
    TE.tryCatch(
      () => client.databases.createIfNotExists({ id: dbName }),
      toCosmosErrorResponse
    ),
    TE.map(databaseResponse => databaseResponse.database)
  );

export const createContainer = (
  db: Database,
  containerName: string,
  partitionKey: string,
  indexingPolicy?: IndexingPolicy
): TE.TaskEither<CosmosErrors, Container> =>
  pipe(
    TE.tryCatch(
      () =>
        db.containers.createIfNotExists({
          id: containerName,
          indexingPolicy,
          partitionKey: `/${partitionKey}`
        }),
      toCosmosErrorResponse
    ),
    TE.map(containerResponse => containerResponse.container)
  );

export const deleteContainer = (
  db: Database,
  containerName: string
): TE.TaskEither<CosmosErrors, Container> =>
  pipe(
    TE.tryCatch(
      () => db.container(containerName).delete(),
      toCosmosErrorResponse
    ),
    TE.map(containerResponse => containerResponse.container)
  );
