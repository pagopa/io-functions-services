import { Context } from "@azure/functions";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as t from "io-ts";
import { Json } from "io-ts-types";

/**
 * Wrap a function handler so that we can decode teh expected input
 * TODO: it works only for the first input so far, to extended
 *
 * @param handler the handler to be executed
 * @returns
 */
export const withDecodedInput =
  <O, E, T = unknown>(
    type: t.Type<E, O, unknown>,
    handler: (
      context: Context,
      ...parsedInputs: readonly [E, ...(readonly Json[])]
    ) => Promise<T>
  ) =>
  async (
    context: Context,
    input: Json,
    ...otherInputs: readonly Json[]
  ): Promise<T> =>
    pipe(
      input,
      type.decode,
      E.getOrElseW(err => {
        context.log.error(
          `${
            context.executionContext.functionName
          }|invalid shape for incoming queue item|${readableReport(err)}`
        );
        throw new Error(
          `Cannot decode incoming queue item into ${
            type.name
          } object: ${readableReport(err)}`
        );
      }),
      decodedInput => handler(context, decodedInput, ...otherInputs)
    );
