import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { parseCommaSeparatedListOf } from "../utils";

describe("parseCommaSeparatedListOf", () => {
  it.each`
    title                                 | input                 | expected                | decoder
    ${"undefined into an empty array"}    | ${undefined}          | ${[]}                   | ${t.any}
    ${"empty string into an empty array"} | ${undefined}          | ${[]}                   | ${t.string}
    ${"single element"}                   | ${"abc"}              | ${["abc"]}              | ${t.string}
    ${"list with empty elements"}         | ${"a,,b,c,"}          | ${["a", "b", "c"]}      | ${t.string}
    ${"'a,b,c' into ['a','b','c]"}        | ${"a,b,c"}            | ${["a", "b", "c"]}      | ${t.string}
    ${"trim elements"}                    | ${"a , b, c "}        | ${["a", "b", "c"]}      | ${t.string}
    ${"fiscal codes"}                     | ${"AAABBB80A01C123D"} | ${["AAABBB80A01C123D"]} | ${FiscalCode}
  `("should parse $title", ({ input, expected, decoder }) => {
    parseCommaSeparatedListOf(decoder)(input).fold(
      err => {
        fail(`cannot decode input: ${readableReport(err)}`);
      },
      value => {
        expect(value).toEqual(expected);
      }
    );
  });

  it.each`
    title                     | input        | decoder
    ${"non-string values"}    | ${123}       | ${t.any}
    ${"invalid fiscal codes"} | ${"invalid"} | ${FiscalCode}
    ${"'1,2,3' into [1,2,3]"} | ${"1,2,3"}   | ${t.number}
  `("should fail to parse $title", ({ input, decoder }) => {
    const result = parseCommaSeparatedListOf(decoder)(input);
    expect(result.isLeft()).toBeTruthy();
  });
});
