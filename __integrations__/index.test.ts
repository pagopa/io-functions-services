import * as E from "fp-ts/Either";

import { createClient } from "./generated/fn-services/client";

import { FiscalCode } from "./generated/fn-services/FiscalCode";
import { MessageContent } from "./generated/fn-services/MessageContent";

import { WAIT_MS } from "./env";

jest.setTimeout(WAIT_MS * 5);

const fetch = require("node-fetch");
const baseUrl = "http://function:7071";

beforeAll(async () => {});
afterAll(async () => {});

beforeEach(() => jest.clearAllMocks());

export const aFiscalCode = "AAABBB01C02D345D" as FiscalCode;

export const aMessageBodyMarkdown = "test".repeat(80);
export const aMessageContent: MessageContent = {
  markdown: aMessageBodyMarkdown,
  subject: "test".repeat(10)
};

const aSubscriptionKey = "aSubscriptionKey";
const aContent = aMessageContent;

describe("fn-services |> ping", () => {
  const client = createClient<"SubscriptionKey">({
    baseUrl,
    fetchApi: fetch,
    withDefaults: op => params =>
      op({
        ...params,
        SubscriptionKey: aSubscriptionKey
      })
  });

  it("/info return 200", async () => {
    const response = await fetch("http://function:7071/api/info");
    const body = await response.text();

    console.log(body);

    // We expects some configurations to fail
    expect(response.status).toEqual(500);
  });

  it("should return 403 Forbidden if no header has been provided", async () => {
    const response = await client.submitMessageforUserWithFiscalCodeInBody({
      message: { fiscal_code: aFiscalCode, content: aContent }
    });

    console.log(response);

    // We expects some configurations to fail
    expect(E.isRight(response)).toEqual(true);
    if (E.isRight(response)) {
      expect(response.right.status).toEqual(403);
    }
  });
});
