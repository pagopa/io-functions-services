/* eslint-disable no-console */
import { fillAzureStorage } from "./azure_storage";
import { fillCosmosDb, initCosmosDb } from "./cosmosdb";

import * as E from "fp-ts/Either";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const main = async (): Promise<void> => {
  console.log("Wait the Cosmos Emulator to setup");

  const maybe_db = await initCosmosDb(
    process.env.COSMOSDB_URI,
    process.env.COSMOSDB_KEY,
    process.env.COSMOSDB_NAME
  );

  if (E.isLeft(maybe_db)) {
    throw new Error(maybe_db.left.message);
  }

  await fillCosmosDb(maybe_db.right);

  await fillAzureStorage(process.env.QueueStorageConnection);
};

console.log("Setting up data....");

main()
  .then(
    _ => {
      console.log("Fixtures set up");
    },
    _reject => {
      console.log(`rejection:`);
      console.log(_reject);
      process.exit(1);
    }
  )
  .catch(_err => {
    console.log(`error:`);
    console.log(_err);
    process.exit(1);
  });
