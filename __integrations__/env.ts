export const AzureWebJobsStorage = process.env.AzureWebJobsStorage;
export const QueueStorageConnection = process.env.QueueStorageConnection || "";

// Milliseconds to wait for test completion
export const WAIT_MS = Number(process.env.WH1_PORT || 5000);
