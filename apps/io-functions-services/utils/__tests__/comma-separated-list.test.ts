import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { fail } from "assert";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as t from "io-ts";
import { describe, expect, it } from "vitest";

import { CommaSeparatedListOf } from "../comma-separated-list";

describe("CommaSeparatedListOf", () => {
  it.each`
    title                                 | input                 | expected                | decoder
    ${"undefined into an empty array"}    | ${undefined}          | ${[]}                   | ${t.any}
    ${"empty string into an empty array"} | ${undefined}          | ${[]}                   | ${t.string}
    ${"single element"}                   | ${"abc"}              | ${["abc"]}              | ${t.string}
    ${"list with empty elements"}         | ${"a,,b,c,"}          | ${["a", "b", "c"]}      | ${t.string}
    ${"'a,b,c' into ['a','b','c]"}        | ${"a,b,c"}            | ${["a", "b", "c"]}      | ${t.string}
    ${"trim elements"}                    | ${"a , b, c "}        | ${["a", "b", "c"]}      | ${t.string}
    ${"fiscal codes"}                     | ${"AAABBB80A01C123D"} | ${["AAABBB80A01C123D"]} | ${FiscalCode}
  `("should parse $title", ({ decoder, expected, input }) => {
    pipe(
      CommaSeparatedListOf(decoder).decode(input),
      E.fold(
        err => {
          fail(`cannot decode input: ${readableReport(err)}`);
        },
        value => {
          expect(value).toEqual(expected);
        }
      )
    );
  });

  it.each`
    title                     | input        | decoder
    ${"non-string values"}    | ${123}       | ${t.any}
    ${"invalid fiscal codes"} | ${"invalid"} | ${FiscalCode}
    ${"'1,2,3' into [1,2,3]"} | ${"1,2,3"}   | ${t.number}
  `("should fail to parse $title", ({ decoder, input }) => {
    const result = CommaSeparatedListOf(decoder).decode(input);
    expect(E.isLeft(result)).toBeTruthy();
  });
});
