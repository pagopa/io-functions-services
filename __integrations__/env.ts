export const AzureWebJobsStorage = process.env.AzureWebJobsStorage;
export const QueueStorageConnection = process.env.QueueStorageConnection || "";

// Milliseconds to wait for test completion
export const WAIT_MS = Number(process.env.WAIT_MS ?? 5000);
export const SHOW_LOGS = process.env.SHOW_LOGS === "true";

export const COSMOSDB_URI = process.env.COSMOSDB_URI;
export const COSMOSDB_KEY = process.env.COSMOSDB_KEY;
export const COSMOSDB_NAME = process.env.COSMOSDB_NAME;
