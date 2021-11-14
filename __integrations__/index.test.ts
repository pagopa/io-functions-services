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

export const aLegacyFiscalCode = "AAABBB01C02D345L" as FiscalCode;
export const anAutoFiscalCode = "AAABBB01C02D345A" as FiscalCode;

export const aMessageBodyMarkdown = "test".repeat(80);
export const aMessageContent: MessageContent = {
  markdown: aMessageBodyMarkdown,
  subject: "test".repeat(10)
};

// Must correspond to an existing serviceId within "services" colletion
const aSubscriptionId = "aServiceId";
const aSubscriptionKey = "aSubscriptionKey";

const customHeaders = {
  "x-user-groups":
    "ApiUserAdmin,ApiLimitedProfileRead,ApiFullProfileRead,ApiProfileWrite,ApiDevelopmentProfileWrite,ApiServiceRead,ApiServiceList,ApiServiceWrite,ApiPublicServiceRead,ApiPublicServiceList,ApiServiceByRecipientQuery,ApiMessageRead,ApiMessageWrite,ApiMessageWriteDefaultAddress,ApiMessageList,ApiSubscriptionsFeedRead,ApiInfoRead,ApiDebugRead,ApiMessageWriteEUCovidCert",
  "x-subscription-id": aSubscriptionId,
  "x-user-email": "unused@example.com",
  "x-user-id": "unused",
  "x-user-note": "unused",
  "x-functions-key": "unused",
  "x-forwarded-for": "0.0.0.0"
};
const customNodeFetch: typeof fetch = async (
  input: RequestInfo,
  init?: RequestInit
) => {
  console.log("Sending request");
  console.log(input);

  const res = await ((nodeFetch as unknown) as typeof fetch)(input, {
    ...init,
    headers: {
      ...init.headers,
      ...customHeaders
    }
  });

  console.log("Result: ");
  console.log(res);

  return res;
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Wait some time
beforeAll(async () => {
  await delay(5000);
});

describe("fn-services |> ping", () => {
  it("/info return 200", async () => {
    const response = await nodeFetch("http://function:7071/api/info");
    const body = await response.text();

    console.log(body);

    // We expects some configurations to fail
    expect(response.status).toEqual(500);
  });
});

describe("Legacy profile |> Create Message", () => {
  const client = createClient<"SubscriptionKey">({
    basePath: "/api/v1",
    baseUrl,
    fetchApi: customNodeFetch,
    withDefaults: op => params =>
      op({
        ...params,
        SubscriptionKey: aSubscriptionKey
      })
  });

  it("should return 201 when creating a message", async () => {
    console.log(`Env variable: ${WAIT_MS}`);

    await delay(5000);

    const body = {
      message: { fiscal_code: anAutoFiscalCode, content: aMessageContent }
    };

    const response = await client.submitMessageforUserWithFiscalCodeInBody(
      body
    );

    expect(E.isRight(response)).toEqual(true);
    if (E.isRight(response)) {
      expect(response.right.status).toEqual(201);
    }
  });

  it("should return the created message", async () => {
    const fiscalCode = anAutoFiscalCode;
    const body = {
      message: { fiscal_code: fiscalCode, content: aMessageContent }
    };

    const response = await client.submitMessageforUserWithFiscalCodeInBody(
      body
    );

    expect(E.isRight(response)).toEqual(true);
    if (E.isRight(response)) {
      expect(response.right.status).toEqual(201);
      if (response.right.status === 201) {
        const messageId = response.right.value.id;
        expect(messageId).not.toBeUndefined();

        // Wait for process to complete
        await delay(2000);

        const responseGet = await client.getMessage({
          id: messageId,
          fiscal_code: fiscalCode
        });

        expect(E.isRight(responseGet)).toEqual(true);
        if (E.isRight(responseGet)) {
          expect(responseGet.right.status).toEqual(200);

          if (responseGet.right.status === 200) {
            expect(responseGet.right.value).toEqual(
              expect.objectContaining({
                message: expect.objectContaining({
                  id: messageId,
                  ...body.message
                }),
                status: "PROCESSED"
              })
            );
          }
        }
      }
    }
  });
});
