import * as t from "io-ts";
import * as RA from "fp-ts/lib/ReadonlyArray";
import * as E from "fp-ts/lib/Either";
import { Context } from "@azure/functions";
import { Json, JsonFromString } from "io-ts-types";
import { pipe } from "fp-ts/lib/function";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";

/**
 * Wrap a function handler so that every input is a valid JSON object
 * Useful to normalize input coming from queueTrigger, which could be bot a parsed object or a stringified object
 *
 * @param handler the handler to be executed
 * @returns
 */
export const withJsonInput = <T = unknown>(
  handler: (
    context: Context,
    ...parsedInputs: ReadonlyArray<Json>
  ) => Promise<T>
) => (context: Context, ...inputs: ReadonlyArray<unknown>): Promise<T> =>
  pipe(
    inputs,
    RA.map(input =>
      pipe(
        input,
        t.string.decode,
        E.chain(JsonFromString.decode),
        E.fold(_ => Json.decode(input), E.of)
      )
    ),
    RA.sequence(E.Applicative),
    E.getOrElseW(err => {
      context.log.error(
        `${
          context.executionContext.functionName
        }|invalid incoming queue item|${readableReport(err)}`
      );
      throw new Error(
        `Cannot parse incoming queue item into JSON object: ${readableReport(
          err
        )}`
      );
    }),
    parsedInputs => handler(context, ...parsedInputs)
  );
