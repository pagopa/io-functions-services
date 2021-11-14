import nodeFetch from "node-fetch";

import * as E from "fp-ts/Either";

import { createClient } from "./generated/fn-services/client";

import { FiscalCode } from "./generated/fn-services/FiscalCode";
import { MessageContent } from "./generated/fn-services/MessageContent";

import { WAIT_MS } from "./env";

jest.setTimeout(WAIT_MS * 5);

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
    basePath: "/api/v1",
    baseUrl,
    fetchApi: (nodeFetch as unknown) as typeof fetch,
    withDefaults: op => params =>
      op({
        ...params,
        SubscriptionKey: aSubscriptionKey
      })
  });

  it("/info return 200", async () => {
    const response = await nodeFetch("http://function:7071/api/info");
    const body = await response.text();

    // We expects some configurations to fail
    expect(response.status).toEqual(500);
  });

  it("should return 403 Forbidden if no header has been provided", async () => {
    const body = {
      message: { fiscal_code: aFiscalCode, content: aContent }
    };

    const response = await client.submitMessageforUserWithFiscalCodeInBody(
      body
    );

    if (E.isLeft(response)) console.log(response.left);

    const nodeFetchResponse = await nodeFetch(
      "http://function:7071/api/v1/messages",
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          SubscriptionKey: aSubscriptionKey
        }
      }
    );

    console.log("---> node response");
    console.log(nodeFetchResponse);

    // We expects some configurations to fail
    expect(E.isRight(response)).toEqual(true);
    if (E.isRight(response)) {
      expect(response.right.status).toEqual(403);
    }
  });
});
