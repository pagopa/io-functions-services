import { BlobServiceClient } from "@azure/storage-blob";
import { log } from "./utils/logger";

export const fillAzureStorage = async (
  QueueStorageConnection: string
): Promise<void> => {
  log("Creating Queue Storages");
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    QueueStorageConnection
  );

  await Promise.all([
    blobServiceClient.createContainer("message-content"),
    blobServiceClient.createContainer("push-notifications")
  ]);

  log("Queue Storages created");
};
