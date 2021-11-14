import { BlobServiceClient } from "@azure/storage-blob";

export const fillAzureStorage = async (
  QueueStorageConnection: string
): Promise<void> => {
  console.log("Creating Queue Storages");
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    QueueStorageConnection
  );

  await Promise.all([
    blobServiceClient.createContainer("message-content"),
    blobServiceClient.createContainer("push-notifications")
  ]);

  console.log("Queue Storages created");
};
