import nodeFetch from "node-fetch";

import * as E from "fp-ts/Either";

import { createClient } from "./generated/fn-services/client";

import { FiscalCode } from "./generated/fn-services/FiscalCode";
import { MessageContent } from "./generated/fn-services/MessageContent";

import { WAIT_MS, SHOW_LOGS } from "./env";
import {
  MessageResponseWithContent,
  StatusEnum
} from "./generated/fn-services/MessageResponseWithContent";
import { CreatedMessage } from "./generated/fn-services/CreatedMessage";
import { ProblemJson } from "./generated/fn-services/ProblemJson";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { exit } from "process";

jest.setTimeout(WAIT_MS * 5);

const baseUrl = "http://function:7071";

beforeAll(async () => {});
afterAll(async () => {});

beforeEach(() => jest.clearAllMocks());

// ----------------

export const aLegacyInboxEnabledFiscalCode = "AAABBB01C02D345L" as FiscalCode;
export const aLegacyInboxDisabledFiscalCode = "AAABBB01C02D345I" as FiscalCode;
export const anAutoFiscalCode = "AAABBB01C02D345A" as FiscalCode;
export const aManualFiscalCode = "AAABBB01C02D345M" as FiscalCode;

export const anEnabledServiceId = "anEnabledServiceId" as NonEmptyString;
export const aDisabledServiceId = "aDisabledServiceId" as NonEmptyString;
const aNonExistingServiceId = "aNonExistingServiceId" as NonEmptyString;

// ----------------

export const aMessageBodyMarkdown = "test".repeat(80);
export const aMessageContent: MessageContent = {
  markdown: aMessageBodyMarkdown,
  subject: "test".repeat(10)
};

// Must correspond to an existing serviceId within "services" colletion
const aSubscriptionKey = "aSubscriptionKey";

const customHeaders = {
  "x-user-groups":
    "ApiUserAdmin,ApiLimitedProfileRead,ApiFullProfileRead,ApiProfileWrite,ApiDevelopmentProfileWrite,ApiServiceRead,ApiServiceList,ApiServiceWrite,ApiPublicServiceRead,ApiPublicServiceList,ApiServiceByRecipientQuery,ApiMessageRead,ApiMessageWrite,ApiMessageWriteDefaultAddress,ApiMessageList,ApiSubscriptionsFeedRead,ApiInfoRead,ApiDebugRead,ApiMessageWriteEUCovidCert",
  "x-subscription-id": anEnabledServiceId,
  "x-user-email": "unused@example.com",
  "x-user-id": "unused",
  "x-user-note": "unused",
  "x-functions-key": "unused",
  "x-forwarded-for": "0.0.0.0",
  "Ocp-Apim-Subscription-Key": aSubscriptionKey
};

const mockGetCustomHeaders = jest.fn(() => customHeaders);

const mockNodeFetch = jest.fn(
  async (input: RequestInfo, init?: RequestInit) => {
    if (SHOW_LOGS) {
      console.log("Sending request");
      console.log(input);
    }

    const res = await ((nodeFetch as unknown) as typeof fetch)(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...mockGetCustomHeaders()
      }
    });

    if (SHOW_LOGS) {
      console.log("Result: ");
      console.log(res);
    }

    return res;
  }
);

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const client = createClient<"SubscriptionKey">({
  basePath: "/api/v1",
  baseUrl,
  fetchApi: mockNodeFetch,
  withDefaults: op => params =>
    op({
      ...params,
      SubscriptionKey: aSubscriptionKey
    })
});

// Wait some time
beforeAll(async () => {
  let i = 0;
  while (i < 100) {
    console.log("Waiting the function to setup..");
    try {
      const response = await nodeFetch("http://function:7071/api/info");
      break;
    } catch (e) {
      await delay(WAIT_MS);
      i++;
    }
  }
  if (i >= 10) {
    console.log("Function unable to setup in time");
    exit(1);
  }
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

describe("Create Message |> Middleware errors", () => {
  it("should return 403 when creating a message from a non existing Service", async () => {
    mockGetCustomHeaders.mockImplementationOnce(() => ({
      ...customHeaders,
      "x-subscription-id": aNonExistingServiceId
    }));

    const body = {
      message: { fiscal_code: anAutoFiscalCode, content: aMessageContent }
    };

    const response = await client.submitMessageforUserWithFiscalCodeInBody(
      body
    );

    expect(E.isRight(response)).toEqual(true);
    if (E.isRight(response)) {
      expect(response.right.status).toEqual(403);
    }
  });

  it("should return 201 when no middleware fails", async () => {
    const body = {
      message: {
        fiscal_code: aLegacyInboxEnabledFiscalCode,
        content: aMessageContent
      }
    };

    const response = await client.submitMessageforUserWithFiscalCodeInBody(
      body
    );

    expect(E.isRight(response)).toEqual(true);
    if (E.isRight(response)) {
      expect(response.right.status).toEqual(201);
    }
  });
});

describe("Create Message |> Legacy profile", () => {
  const fiscalCode = aLegacyInboxEnabledFiscalCode;

  it("should return the message in PROCESSED status when service is allowed to send", async () => {
    const body = {
      message: { fiscal_code: fiscalCode, content: aMessageContent }
    };

    const result = await postCreateMessage(body);

    expect(result.status).toEqual(201);

    const messageId = ((await result.json()) as CreatedMessage).id;
    expect(messageId).not.toBeUndefined();

    // Wait the process to complete
    await delay(WAIT_MS);

    const resultGet = await getSentMessage(fiscalCode, messageId);

    expect(resultGet.status).toEqual(200);
    const detail = (await resultGet.json()) as MessageResponseWithContent;

    expect(detail).toEqual(
      expect.objectContaining({
        message: expect.objectContaining({
          id: messageId,
          ...body.message
        }),
        status: StatusEnum.PROCESSED
      })
    );
  });

  it("should return 403 Not Allowed when service is NOT allowed to send", async () => {
    mockGetCustomHeaders
      .mockImplementationOnce(() => ({
        ...customHeaders,
        "x-subscription-id": aDisabledServiceId
      }))
      .mockImplementationOnce(() => ({
        ...customHeaders,
        "x-subscription-id": aDisabledServiceId
      }));

    const body = {
      message: { fiscal_code: fiscalCode, content: aMessageContent }
    };

    const result = await postCreateMessage(body);

    expect(result.status).toEqual(201);

    const messageId = ((await result.json()) as CreatedMessage).id;
    expect(messageId).not.toBeUndefined();

    // Wait the process to complete
    await delay(WAIT_MS);

    const resultGet = await getSentMessage(fiscalCode, messageId);
    const detail = await resultGet.json();

    expect(resultGet.status).toEqual(403);
    expect(detail).toEqual({
      detail:
        "You do not have enough permission to complete the operation you requested",
      status: 403,
      title: "You are not allowed here"
    });
  });
});

describe("Create Message |> Auto profile", () => {
  const fiscalCode = anAutoFiscalCode;

  it("should return the message in PROCESSED status when service is allowed to send", async () => {
    const body = {
      message: { fiscal_code: fiscalCode, content: aMessageContent }
    };

    const result = await postCreateMessage(body);

    expect(result.status).toEqual(201);

    const messageId = ((await result.json()) as CreatedMessage).id;
    expect(messageId).not.toBeUndefined();

    // Wait the process to complete
    await delay(WAIT_MS);

    const resultGet = await getSentMessage(fiscalCode, messageId);

    expect(resultGet.status).toEqual(200);
    const detail = (await resultGet.json()) as MessageResponseWithContent;

    expect(detail).toEqual(
      expect.objectContaining({
        message: expect.objectContaining({
          id: messageId,
          ...body.message
        }),
        status: StatusEnum.PROCESSED
      })
    );
  });

  it("should return 403 Not Allowed when service is NOT allowed to send", async () => {
    mockGetCustomHeaders
      .mockImplementationOnce(() => ({
        ...customHeaders,
        "x-subscription-id": aDisabledServiceId
      }))
      .mockImplementationOnce(() => ({
        ...customHeaders,
        "x-subscription-id": aDisabledServiceId
      }));

    const body = {
      message: { fiscal_code: fiscalCode, content: aMessageContent }
    };

    const result = await postCreateMessage(body);

    expect(result.status).toEqual(201);

    const messageId = ((await result.json()) as CreatedMessage).id;
    expect(messageId).not.toBeUndefined();

    // Wait the process to complete
    await delay(WAIT_MS);

    const resultGet = await getSentMessage(fiscalCode, messageId);
    const detail = await resultGet.json();

    expect(resultGet.status).toEqual(403);
    expect(detail).toEqual({
      detail:
        "You do not have enough permission to complete the operation you requested",
      status: 403,
      title: "You are not allowed here"
    });
  });
});

describe("Create Message |> Manual profile", () => {
  const fiscalCode = aManualFiscalCode;

  it("should return the message in PROCESSED status when service is allowed to send", async () => {
    const body = {
      message: { fiscal_code: fiscalCode, content: aMessageContent }
    };

    const result = await postCreateMessage(body);

    expect(result.status).toEqual(201);

    const messageId = ((await result.json()) as CreatedMessage).id;
    expect(messageId).not.toBeUndefined();

    // Wait the process to complete
    await delay(WAIT_MS);

    const resultGet = await getSentMessage(fiscalCode, messageId);

    expect(resultGet.status).toEqual(200);
    const detail = (await resultGet.json()) as MessageResponseWithContent;

    expect(detail).toEqual(
      expect.objectContaining({
        message: expect.objectContaining({
          id: messageId,
          ...body.message
        }),
        status: StatusEnum.PROCESSED
      })
    );
  });

  it("should return 403 Forbidden when service is NOT allowed to send", async () => {
    mockGetCustomHeaders
      .mockImplementationOnce(() => ({
        ...customHeaders,
        "x-subscription-id": aDisabledServiceId
      }))
      .mockImplementationOnce(() => ({
        ...customHeaders,
        "x-subscription-id": aDisabledServiceId
      }));

    const body = {
      message: { fiscal_code: fiscalCode, content: aMessageContent }
    };

    const result = await postCreateMessage(body);

    expect(result.status).toEqual(201);

    const messageId = ((await result.json()) as CreatedMessage).id;
    expect(messageId).not.toBeUndefined();

    // Wait the process to complete
    await delay(WAIT_MS);

    const resultGet = await getSentMessage(fiscalCode, messageId);

    expect(resultGet.status).toEqual(403);
    const detail = (await resultGet.json()) as ProblemJson;
    expect(detail).toEqual({
      detail:
        "You do not have enough permission to complete the operation you requested",
      status: 403,
      title: "You are not allowed here"
    });
  });
});

// -----------
// Utils
// -----------

const postCreateMessage = async body => {
  return await mockNodeFetch(`${baseUrl}/api/v1/messages`, {
    method: "POST",
    headers: {
      ...mockGetCustomHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body.message)
  });
};

function getSentMessage(fiscalCode, messageId: string) {
  return mockNodeFetch(`${baseUrl}/api/v1/messages/${fiscalCode}/${messageId}`);
}
