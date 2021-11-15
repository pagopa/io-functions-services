import * as t from "io-ts";
import * as O from "fp-ts/lib/Option";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";

import { DataFetcher, withExpandedInput } from "../with-expanded-input";
import { Context } from "@azure/functions";

type AType = t.TypeOf<typeof AType>;
const AType = t.interface({ bar: t.literal("bar") });

type AnExpandedType = t.TypeOf<typeof AnExpandedType>;
const AnExpandedType = t.interface({ foo: t.literal("foo") });

const anExpandedData = { foo: "foo" as const };
const aDataFetcher: DataFetcher<AnExpandedType> = _ =>
  TE.of(O.some(anExpandedData));

const aFailingDataFetcher: DataFetcher<AnExpandedType> = _ =>
  TE.left(new Error());

const aEmptyDataFetcher: DataFetcher<AnExpandedType> = _ => TE.of(O.none);
const aThrowingDataFetcher: DataFetcher<AnExpandedType> = _ => {
  throw "something went very bad";
};

const aFinalResult = "anyvalue";
const aHandler = jest.fn(
  async (_: Context, __: AType & AnExpandedType) => aFinalResult
);

const createContext = () =>
  (({
    bindings: {},
    executionContext: { functionName: "funcname" },
    log: { ...console, verbose: console.log }
  } as unknown) as Context);

describe("withExpandedInput", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should work", async () => {
    const finalHandler = withExpandedInput<AType, "bar", AnExpandedType>(
      "bar",
      aDataFetcher,
      aHandler
    );

    const context = createContext();
    const input = { bar: "bar" as const };
    const result = await finalHandler(context, input);

    expect(result).toEqual(aFinalResult);
    expect(aHandler).toBeCalledWith(context, {
      ...input,
      ...anExpandedData
    });
  });

  it.each`
    scenario                      | dataFetcher
    ${"failing to retrieve data"} | ${aFailingDataFetcher}
    ${"no data is retrieved"}     | ${aEmptyDataFetcher}
    ${"data fetcher throws"}      | ${aThrowingDataFetcher}
  `("should not execute handler when $scenario", async ({ dataFetcher }) => {
    const finalHandler = withExpandedInput<AType, "bar", AnExpandedType>(
      "bar",
      dataFetcher,
      aHandler
    );

    const context = createContext();
    const input = { bar: "bar" as const };
    try {
      const _ = await finalHandler(context, input);
      fail(`Expected handler to throw`);
    } catch (ex) {
      expect(aHandler).not.toBeCalled();
    }
  });
});
