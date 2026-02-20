import { InvocationContext } from "@azure/functions";
import { getBlobAsObject } from "@pagopa/io-functions-commons/dist/src/utils/azure_storage";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { Json } from "io-ts-types";

/**
 * A type definign a generic function to fetch data
 */
export type DataFetcher<E> = (
  blobName: string
) => TE.TaskEither<Error, O.Option<E>>;

/**
 * Create a data fetcher which retrieved data from a specific blob storage container
 *
 * @param type a codec defining the expected shape of retrieved data
 * @param blobService an instance of blob service
 * @param blobName the name of the bucket
 * @param options optional blobl query options
 * @returns a DataFetcher instance
 */
export const makeRetrieveExpandedDataFromBlob =
  <A, O, I>(
    type: t.Type<A, O, I>,
    blobService: Parameters<typeof getBlobAsObject>[1],
    containerName: string,
    options: Parameters<typeof getBlobAsObject>[4] = {}
  ): DataFetcher<A> =>
  (
    blobName: Parameters<typeof getBlobAsObject>[3]
  ): TE.TaskEither<Error, O.Option<A>> =>
    pipe(
      TE.tryCatch(
        () =>
          getBlobAsObject<A, O, I>(
            type,
            blobService,
            containerName,
            blobName,
            options
          ),
        E.toError
      ),
      TE.chain(TE.fromEither)
    );

/**
 * Wrap a function handler so that we can expand its input reading an external storage
 * Due to Azure Queue storage limitations in terms of size of an item, we're constrained to keep bulky parts of queue item into a separated blob storage
 * Once the queue item is provided as input, it will be expanded by merging the content from such blob
 *
 * @param handler the handler to be executed
 * @returns
 */
export const withExpandedInput =
  <I extends Record<K, string>, K extends keyof I, E, T = unknown>(
    referenceKey: K,
    retrieveExpandedData: DataFetcher<E>,
    handler: (
      context: InvocationContext,
      ...parsedInputs: readonly [E & I, ...(readonly Json[])]
    ) => Promise<T>
  ) =>
  async (
    context: InvocationContext,
    input: I,
    ...otherInputs: readonly Json[]
  ): Promise<T> => {
    const expandedData = await pipe(
      input[referenceKey],
      retrieveExpandedData,
      TE.mapLeft(err => {
        context.error(
          `${context.functionName}|error while retrieving expanded content|referenceKey=${input[referenceKey]}|${err.message}`
        );
        return new Error(
          `Cannot retrieving expanded content for ${input[referenceKey]}: ${err.message}`
        );
      }),
      TE.chainW(
        flow(
          O.fold(
            () => {
              context.error(
                `${context.functionName}|ecannot find expanded content|referenceKey=${input[referenceKey]}`
              );
              return TE.left(
                new Error(
                  `Cannot find expanded content for ${input[referenceKey]}`
                )
              );
            },
            e => TE.of(e)
          )
        )
      )
    )();

    if (E.isLeft(expandedData)) {
      throw expandedData.left;
    }

    return handler(
      context,
      { ...input, ...expandedData.right },
      ...otherInputs
    );
  };
