import { TableServiceClient } from "@azure/data-tables";

const tableServiceClient = TableServiceClient.fromConnectionString(
  process.env.QueueStorageConnection,
  { allowInsecureConnection: true }
);

const val = await Promise.all([tableServiceClient.createTable("test-table")]);

console.log("<----->");
console.log(val);
console.log("<----->");
