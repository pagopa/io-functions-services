import { upsertBlobFromObject as upsertBlobFromObjectBase } from "@pagopa/io-functions-commons/dist/src/utils/azure_storage";
import { pipe } from "fp-ts/lib/function";

import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import { IRequestMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { IResponse } from "@pagopa/ts-commons/lib/responses";
import { Request } from "express";

// just a trick to keep upsertBlobFromObject in sync with upsertBlobFromObject
//  by extracting its left and right types
type UpsertReturnType = ReturnType<
  typeof upsertBlobFromObjectBase
> extends Promise<E.Either<infer L, infer R>>
  ? TE.TaskEither<L, R>
  : never;

// @ts-expect-error to help TS compiler ensure UpsertReturnType is not never
const _: never = "any" as UpsertReturnType; // eslint-disable-line @typescript-eslint/no-unused-vars

export const makeUpsertBlobFromObject = (
  blobService: Parameters<typeof upsertBlobFromObjectBase>[0],
  containerName: Parameters<typeof upsertBlobFromObjectBase>[1],
  options: Parameters<typeof upsertBlobFromObjectBase>[4] = {}
) => <T>(blobName: string, content: T): UpsertReturnType =>
  pipe(
    TE.tryCatch(
      () =>
        upsertBlobFromObjectBase(
          blobService,
          containerName,
          blobName,
          content,
          options
        ),
      E.toError
    ),
    TE.chain(TE.fromEither)
  );
