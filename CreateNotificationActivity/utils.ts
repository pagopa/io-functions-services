import { Either } from "fp-ts/lib/Either";
import * as t from "io-ts";

/**
 * Parses a list of comma-separated elements into an array of typed items, using the provided decoder
 * @param decoder a io-ts decoder
 * @param input a string of comma-separated elements
 *
 * @returns either a decode error or the array of decoded items
 */
export const parseCommaSeparatedListOf = (decoder: t.Mixed) => (
  input: string | undefined
): Either<t.Errors, ReadonlyArray<t.TypeOf<typeof decoder>>> =>
  t.readonlyArray(decoder).decode(
    typeof input === "string"
      ? input
          .split(",")
          .map(e => e.trim())
          .filter(Boolean)
      : !input
      ? [] // fallback to empty array in case of empty input
      : input // it should not happen, but in case we let the decoder fail
  );
