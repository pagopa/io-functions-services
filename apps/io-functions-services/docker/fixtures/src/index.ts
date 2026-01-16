/* eslint-disable @typescript-eslint/no-unused-vars */
import { fillAzureStorage } from "./azure_storage";
import { fillCosmosDb } from "./cosmosdb";

const main = async (): Promise<void> => {
  await fillCosmosDb(
    process.env.COSMOSDB_URI,
    process.env.COSMOSDB_KEY,
    process.env.COSMOSDB_NAME
  );
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
