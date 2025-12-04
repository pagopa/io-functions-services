import { BlobServiceClient } from "@azure/storage-blob";
import { QueueServiceClient } from "@azure/storage-queue";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as RA from "fp-ts/lib/ReadonlyArray";
import * as T from "fp-ts/lib/Task";
import * as TE from "fp-ts/lib/TaskEither";

import { log } from "./utils/logger";

const createQueues = (
  queueServiceClient: QueueServiceClient,
  queues: string[]
) =>
  pipe(
    queues,
    T.of,
    T.chain(
      flow(
        RA.map(q =>
          TE.tryCatch(async () => queueServiceClient.createQueue(q), E.toError)
        ),
        RA.sequence(T.ApplicativeSeq)
      )
    )
  );

const createBlobs = (blobServiceClient: BlobServiceClient, blobs: string[]) =>
  pipe(
    blobs,
    T.of,
    T.chain(
      flow(
        RA.map(b =>
          TE.tryCatch(
            async () => blobServiceClient.createContainer(b),
            E.toError
          )
        ),
        RA.sequence(T.ApplicativeSeq)
      )
    )
  );

export const fillAzureStorage = async (
  QueueStorageConnection: string
): Promise<void> => {
  const blobs = process.env.BLOBS.split(",");

  log(`Creating ${blobs.length} Blob Storages`);
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    QueueStorageConnection
  );

  const resB = await createBlobs(blobServiceClient, blobs)();

  const [rightsB, leftsB] = [RA.rights(resB), RA.lefts(resB)];

  log(`${rightsB.length} Blob Storages created`);
  log(`${leftsB.length} Blob Storages not created`);
  log(leftsB);

  // -------

  const queues = process.env.QUEUES.split(",");

  log(`Creating ${queues.length} Queue Storages`);
  const queueServiceClient = QueueServiceClient.fromConnectionString(
    QueueStorageConnection
  );

  const resQ = await createQueues(queueServiceClient, queues)();

  const [rightsQ, leftsQ] = [RA.rights(resQ), RA.lefts(resQ)];

  log(`${rightsQ.length} Queue Storages created`);
  log(`${leftsQ.length} Queue Storages NOT created`);
  log(leftsQ);
};
