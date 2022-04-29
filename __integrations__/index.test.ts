import { CosmosClient } from "@azure/cosmos";

import nodeFetch from "node-fetch";

import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";

import {
  WAIT_MS,
  SHOW_LOGS,
  COSMOSDB_URI,
  COSMOSDB_KEY,
  COSMOSDB_NAME,
  QueueStorageConnection
} from "./env";

import {
  MessageResponseWithContent,
  StatusEnum
} from "./generated/fn-services/MessageResponseWithContent";
import { CreatedMessage } from "./generated/fn-services/CreatedMessage";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { exit } from "process";

import {
  MessageStatusModel,
  MESSAGE_STATUS_COLLECTION_NAME
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import {
  MessageModel,
  MESSAGE_COLLECTION_NAME
} from "@pagopa/io-functions-commons/dist/src/models/message";
import { MessageContent } from "./generated/fn-services/MessageContent";
import { pipe } from "fp-ts/lib/function";
import { sequenceS } from "fp-ts/lib/Apply";
import { createBlobService } from "azure-storage";
import { EmailString } from "@pagopa/ts-commons/lib/strings";
import { FeatureLevelTypeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/FeatureLevelType";

const MAX_ATTEMPT = 50;
jest.setTimeout(WAIT_MS * MAX_ATTEMPT);

const baseUrl = "http://function:7071";

console.log("ENV: ", COSMOSDB_URI, WAIT_MS, SHOW_LOGS);

const blobService = createBlobService(QueueStorageConnection);

const cosmosDB = new CosmosClient({
  endpoint: COSMOSDB_URI,
  key: COSMOSDB_KEY
}).database(COSMOSDB_NAME);

const messageContainer = cosmosDB.container(MESSAGE_COLLECTION_NAME);
const messageModel = new MessageModel(
  messageContainer,
  MESSAGE_COLLECTION_NAME as NonEmptyString
);
const messageStatusContainer = cosmosDB.container(
  MESSAGE_STATUS_COLLECTION_NAME
);
const messageStatusModel = new MessageStatusModel(messageStatusContainer);

// ----------------

const aLegacyInboxEnabledFiscalCode = "AAABBB01C02D345L" as FiscalCode;
const aLegacyInboxDisabledFiscalCode = "AAABBB01C02D345I" as FiscalCode;
const anAutoFiscalCode = "AAABBB01C02D345A" as FiscalCode;
const aManualFiscalCode = "AAABBB01C02D345M" as FiscalCode;

const anEnabledServiceId = "anEnabledServiceId" as NonEmptyString;
const anEnabledServiceWithEmailId = "anEnabledServiceWithEmailId" as NonEmptyString;
const aDisabledServiceId = "aDisabledServiceId" as NonEmptyString;
const aNonExistingServiceId = "aNonExistingServiceId" as NonEmptyString;
const aValidServiceId = "aValidServiceId" as NonEmptyString;
const aValidServiceWithoutWriteMessageGroupsEmail = "validServiceWithoutWriteMessageGroups@legal.it" as EmailString;
const aValidSenderEmail = "test@legal.it" as EmailString;
const aNotExistingSenderEmail = "notExistingEmail@legal.it" as EmailString;
const aNotExistingSenderServiceEmail = "notExistingService@legal.it" as EmailString;
const aRaiseErrorSenderServiceEmail = "aRaiseImpersonateError@legal.it" as EmailString;

// ----------------

export const aMessageBodyMarkdown = "test".repeat(80);
export const aMessageContent: MessageContent = {
  markdown: aMessageBodyMarkdown,
  subject: "test".repeat(10)
};

const aValidLegalMessageContent = {
  ...aMessageContent,
  legal_data: {
    has_attachment: false,
    message_unique_id: "A_MESSAGE_UNIQUE_ID" as NonEmptyString,
    sender_mail_from: "demo@pec.it" as NonEmptyString
  }
};

// Must correspond to an existing serviceId within "services" colletion
const aSubscriptionKey = "aSubscriptionKey";

const customHeaders = {
  "x-user-groups":
    "ApiUserAdmin,ApiLimitedProfileRead,ApiFullProfileRead,ApiProfileWrite,ApiDevelopmentProfileWrite,ApiServiceRead,ApiServiceList,ApiServiceWrite,ApiPublicServiceRead,ApiPublicServiceList,ApiServiceByRecipientQuery,ApiMessageRead,ApiMessageWrite,ApiMessageWriteDefaultAddress,ApiMessageList,ApiSubscriptionsFeedRead,ApiInfoRead,ApiDebugRead,ApiMessageWriteEUCovidCert,ApiMessageWriteWithLegalData",
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
      const response = await nodeFetch(`${baseUrl}/api/info`);
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

  it("should return 403 when creating a legal message directly without right permission", async () => {
    const nodeFetch = getNodeFetch({
      "x-user-groups": "ApiMessageWrite"
    });

    const body = {
      message: {
        fiscal_code: anAutoFiscalCode,
        content: aValidLegalMessageContent
      }
    };

    const response = await postCreateMessage(nodeFetch)(body);

    expect(response.status).toEqual(403);
  });

  it("should return 403 when creating an advanced message without right permission", async () => {
    const nodeFetch = getNodeFetch({
      "x-user-groups": "ApiMessageWrite"
    });

    const body = {
      message: {
        fiscal_code: anAutoFiscalCode,
        feature_type: "ADVANCED",
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

      // TODO Remove when getMessage is merged
      await pipe(
        messageModel.find([messageId as NonEmptyString, fiscalCode]),
        TE.mapLeft(_ => fail(`Error retrieving message data from Cosmos.`)),
        TE.map(message => {
          expect(O.isSome(message)).toBeTruthy();
          if (O.isSome(message)) {
            expect(message.value.featureLevelType).toEqual(
              FeatureLevelTypeEnum.STANDARD
            );
          }
        })
      )();
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

      await pipe(
        {
          message: messageModel.find([messageId as NonEmptyString, fiscalCode]),
          status: messageStatusModel.findLastVersionByModelId([
            messageId as NonEmptyString
          ])
        },
        sequenceS(TE.ApplicativePar),
        TE.bindW("content", _ =>
          pipe(
            messageModel.getContentFromBlob(
              blobService,
              messageId as NonEmptyString
            ),
            TE.orElseW(_ => TE.of(O.none as O.Option<MessageContent>))
          )
        ),
        TE.mapLeft(_ => fail(`Error retrieving message data from Cosmos.`)),
        TE.map(({ message, status, content }) => {
          expect(O.isSome(message)).toBeTruthy();
          expect(O.isSome(status)).toBeTruthy();
          expect(O.isSome(content)).toBeFalsy();

          if (O.isSome(status))
            expect(status.value.status).toEqual(StatusEnum.REJECTED);
        })
      )();

      // TODO: Fix when getMessage will return the message status
      // const resultGet = await getSentMessage(nodeFetch)(fiscalCode, messageId);
      // const detail = await resultGet.json();

      // expect(resultGet.status).toEqual(500);
      // expect(detail).toEqual({
      //   detail: "Error: Cannot get stored message content from blob",
      //   status: 500,
      //   title: "Internal server error"
      // });
    }
  );
});

describe("Create Advanced Message", () => {
  it.each`
    profileType         | fiscalCode                       | serviceId
    ${"LEGACY Profile"} | ${aLegacyInboxEnabledFiscalCode} | ${anEnabledServiceId}
    ${"AUTO Profile"}   | ${anAutoFiscalCode}              | ${anEnabledServiceId}
    ${"MANUAL Profile"} | ${aManualFiscalCode}             | ${anEnabledServiceId}
  `(
    "$profileType |> should return the message in PROCESSED status when service is allowed to send",
    async ({ fiscalCode, serviceId }) => {
      const body = {
        message: {
          fiscal_code: fiscalCode,
          feature_level_type: "ADVANCED",
          content: aMessageContent
        }
      };

      const nodeFetch = getNodeFetch({
        "x-subscription-id": serviceId,
        "x-user-groups":
          customHeaders["x-user-groups"] + ",ApiMessageWriteAdvanced"
      });

      const result = await postCreateMessage(nodeFetch)(body);

      expect(result.status).toEqual(201);

      const messageId = ((await result.json()) as CreatedMessage).id;
      expect(messageId).not.toBeUndefined();

      // Wait the process to complete
      await delay(WAIT_MS);

      const resultGet = await getSentMessage(nodeFetch)(fiscalCode, messageId);

      expect(resultGet.status).toEqual(200);
      const detail = (await resultGet.json()) as MessageResponseWithContent;

      // TODO Change when getMessage is merged
      const { feature_level_type, ...exectedMessageResult } = body.message;
      expect(detail).toMatchObject(
        expect.objectContaining({
          message: expect.objectContaining({
            id: messageId,
            ...exectedMessageResult
          }),
          status: StatusEnum.PROCESSED
        })
      );

      // TODO Remove when getMessage is merged
      await pipe(
        messageModel.find([messageId as NonEmptyString, fiscalCode]),
        TE.mapLeft(_ => fail(`Error retrieving message data from Cosmos.`)),
        TE.map(message => {
          expect(O.isSome(message)).toBeTruthy();
          if (O.isSome(message)) {
            expect(message.value.featureLevelType).toEqual(
              FeatureLevelTypeEnum.ADVANCED
            );
          }
        })
      )();
    }
  );
});

describe("Create Legal Message |> Middleware errors", () => {
  it("should return 403 when creating a legal message from a non existing Service", async () => {
    const nodeFetch = getNodeFetch({
      "x-subscription-id": aNonExistingServiceId
    });

    const body = {
      message: {
        fiscal_code: aLegacyInboxEnabledFiscalCode,
        content: aMessageContent
      }
    };

    const response = await postCreateLegalMessage(nodeFetch)(
      "pec@demo.it",
      body
    );

    expect(response.status).toEqual(403);
  });

  it("should return 400 if wrong mail param is passed", async () => {
    const body = {
      message: {
        fiscal_code: aLegacyInboxEnabledFiscalCode,
        content: aMessageContent
      }
    };

    const response = await postCreateLegalMessage(getNodeFetch())("aaa", body);

    expect(response.status).toEqual(400);
  });

  it("should return 400 given a payload without legal data", async () => {
    const body = {
      message: {
        fiscal_code: aLegacyInboxEnabledFiscalCode,
        content: aMessageContent
      }
    };

    const response = await postCreateLegalMessage(getNodeFetch())(
      "pec@demo.it",
      body
    );

    expect(response.status).toEqual(400);
  });

  it("should return 201 when no middleware fails", async () => {
    const nodeFetch = getNodeFetch({
      "x-subscription-id": aValidServiceId
    });

    const body = {
      message: {
        fiscal_code: anAutoFiscalCode,
        content: aValidLegalMessageContent
      }
    };

    const response = await postCreateLegalMessage(nodeFetch)(
      aValidSenderEmail,
      body
    );

    expect(response.status).toEqual(201);
  });
});

describe("Create Legal Message", () => {
  it.each`
    senderEmail                                    | errorCondition                                                   | errorCode
    ${aNotExistingSenderEmail}                     | ${"sender email does not exists"}                                | ${404}
    ${aNotExistingSenderServiceEmail}              | ${"sender email related service does not exists"}                | ${404}
    ${aRaiseErrorSenderServiceEmail}               | ${"impersonated Service' s retrieve fails"}                      | ${500}
    ${aValidServiceWithoutWriteMessageGroupsEmail} | ${"impersonated Service does not have message write permission"} | ${403}
  `(
    "should return $errorCode if $errorCondition",
    async ({ senderEmail, errorCode }) => {
      const body = {
        message: {
          fiscal_code: anAutoFiscalCode,
          content: aValidLegalMessageContent
        }
      };

      const nodeFetch = getNodeFetch({ "x-subscription-id": aValidServiceId });

      const result = await postCreateLegalMessage(nodeFetch)(senderEmail, body);

      expect(result.status).toEqual(errorCode);
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

const postCreateLegalMessage = (nodeFetch: typeof fetch) => async (
  mailParam,
  body
) => {
  return await nodeFetch(`${baseUrl}/api/v1/legal-messages/${mailParam}`, {
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
