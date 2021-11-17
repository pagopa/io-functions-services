import { BlobServiceClient } from "@azure/storage-blob";
import { QueueServiceClient } from "@azure/storage-queue";
import { log } from "./utils/logger";

export const fillAzureStorage = async (
  QueueStorageConnection: string
): Promise<void> => {
  const blobs = process.env.BLOBS.split(",");

  log(`Creating ${blobs.length} Queue Storages`);
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    QueueStorageConnection
  );

  const resB = await Promise.all(
    blobs.map(b => blobServiceClient.createContainer(b))
  );

  log(`${resB.length} Blob Storages created`);

  // -------

  const queues = process.env.QUEUES.split(",");

  log(`Creating ${queues.length} Queue Storages`);
  const queuServiceClient = QueueServiceClient.fromConnectionString(
    QueueStorageConnection
  );

  const resQ = await Promise.all(
    queues.map(q => queuServiceClient.createQueue(q))
  );

  log(`${resQ.length} Queue Storages created`);
};
