import nodeFetch from "node-fetch";

import { FiscalCode } from "./generated/fn-services/FiscalCode";
import { MessageContent } from "./generated/fn-services/MessageContent";

import { WAIT_MS, SHOW_LOGS } from "./env";
import {
  MessageResponseWithContent,
  StatusEnum
} from "./generated/fn-services/MessageResponseWithContent";
import { CreatedMessage } from "./generated/fn-services/CreatedMessage";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { exit } from "process";

const MAX_ATTEMPT = 50;
jest.setTimeout(WAIT_MS * MAX_ATTEMPT);

const baseUrl = "http://function:7071";

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

const getNodeFetch = (
  headers: Partial<typeof customHeaders> = customHeaders
) => async (input: RequestInfo, init?: RequestInit) => {
  const headersToAdd = {
    ...(init?.headers ?? {}),
    ...customHeaders,
    ...headers
  };

  if (SHOW_LOGS) {
    console.log("Sending request");
    console.log(input);
    console.log(headersToAdd);
  }

  const res = await ((nodeFetch as unknown) as typeof fetch)(input, {
    ...init,
    headers: headersToAdd
  });

  if (SHOW_LOGS) {
    console.log("Result: ");
    console.log(res);
  }

  return res;
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Wait some time
beforeAll(async () => {
  let i = 0;
  while (i < MAX_ATTEMPT) {
    console.log("Waiting the function to setup..");
    try {
      const response = await nodeFetch("http://function:7071/api/info");
      break;
    } catch (e) {
      await delay(WAIT_MS);
      i++;
    }
  }
  if (i >= MAX_ATTEMPT) {
    console.log("Function unable to setup in time");
    exit(1);
  }
});

beforeEach(() => jest.clearAllMocks());

describe("Create Message |> Middleware errors", () => {
  it("should return 403 when creating a message from a non existing Service", async () => {
    const nodeFetch = getNodeFetch({
      "x-subscription-id": aNonExistingServiceId
    });

    const body = {
      message: {
        fiscal_code: aLegacyInboxEnabledFiscalCode,
        content: aMessageContent
      }
    };

    const response = await postCreateMessage(nodeFetch)(body);

    expect(response.status).toEqual(403);
  });

  it("should return 201 when no middleware fails", async () => {
    const body = {
      message: {
        fiscal_code: aLegacyInboxEnabledFiscalCode,
        content: aMessageContent
      }
    };

    const response = await postCreateMessage(getNodeFetch())(body);

    expect(response.status).toEqual(201);
  });
});

describe("Create Message", () => {
  it.each`
    profileType         | fiscalCode                       | serviceId
    ${"LEGACY Profile"} | ${aLegacyInboxEnabledFiscalCode} | ${anEnabledServiceId}
    ${"AUTO Profile"}   | ${anAutoFiscalCode}              | ${anEnabledServiceId}
    ${"MANUAL Profile"} | ${aManualFiscalCode}             | ${anEnabledServiceId}
  `(
    "$profileType |> should return the message in PROCESSED status when service is allowed to send",
    async ({ fiscalCode, serviceId }) => {
      const body = {
        message: { fiscal_code: fiscalCode, content: aMessageContent }
      };

      const nodeFetch = getNodeFetch({ "x-subscription-id": serviceId });

      const result = await postCreateMessage(nodeFetch)(body);

      expect(result.status).toEqual(201);

      const messageId = ((await result.json()) as CreatedMessage).id;
      expect(messageId).not.toBeUndefined();

      // Wait the process to complete
      await delay(WAIT_MS);

      const resultGet = await getSentMessage(nodeFetch)(fiscalCode, messageId);

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
    }
  );

  it.each`
    profileType         | fiscalCode                       | serviceId
    ${"LEGACY Profile"} | ${aLegacyInboxEnabledFiscalCode} | ${aDisabledServiceId}
    ${"AUTO Profile"}   | ${anAutoFiscalCode}              | ${aDisabledServiceId}
    ${"MANUAL Profile"} | ${aManualFiscalCode}             | ${aDisabledServiceId}
  `(
    "$profileType |> return 500 Error when service is NOT allowed to send",
    async ({ fiscalCode, serviceId }) => {
      const nodeFetch = getNodeFetch({
        "x-subscription-id": serviceId
      });

      const body = {
        message: { fiscal_code: fiscalCode, content: aMessageContent }
      };

      const result = await postCreateMessage(nodeFetch)(body);

      expect(result.status).toEqual(201);

      const messageId = ((await result.json()) as CreatedMessage).id;
      expect(messageId).not.toBeUndefined();

      // Wait the process to complete
      await delay(WAIT_MS);

      const resultGet = await getSentMessage(nodeFetch)(fiscalCode, messageId);
      const detail = await resultGet.json();

      expect(resultGet.status).toEqual(500);
      expect(detail).toEqual({
        detail: "Error: Cannot get stored message content from blob",
        status: 500,
        title: "Internal server error"
      });
    }
  );
});

// -----------
// Utils
// -----------

const postCreateMessage = (nodeFetch: typeof fetch) => async body => {
  return await nodeFetch(`${baseUrl}/api/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body.message)
  });
};

const getSentMessage = (nodeFetch: typeof fetch) => async (
  fiscalCode,
  messageId: string
) => {
  return nodeFetch(`${baseUrl}/api/v1/messages/${fiscalCode}/${messageId}`);
};
