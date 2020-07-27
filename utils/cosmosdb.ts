/**
 * Use a singleton CosmosDB client across functions.
 */
import { CosmosClient } from "@azure/cosmos";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

// Setup DocumentDB
export const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
export const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");
export const cosmosDbKey = getRequiredStringEnv("COSMOSDB_KEY");

export const cosmosdbClient = new CosmosClient({
  endpoint: cosmosDbUri,
  key: cosmosDbKey
});

export const cosmosdbInstance = cosmosdbClient.database(cosmosDbName);
