import { CosmosClient } from "@azure/cosmos";

import nodeFetch from "node-fetch";

import * as TE from "fp-ts/TaskEither";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";

import {
  WAIT_MS,
  SHOW_LOGS,
  COSMOSDB_URI,
  COSMOSDB_KEY,
  COSMOSDB_NAME,
  QueueStorageConnection
} from "./env";

import { ExternalMessageResponseWithContent } from "./generated/fn-services/ExternalMessageResponseWithContent";
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
import { FeatureLevelTypeEnum } from "./generated/fn-services/FeatureLevelType";
import { RejectedMessageStatusValueEnum } from "./generated/fn-services/RejectedMessageStatusValue";
import { NotRejectedMessageStatusValueEnum } from "./generated/fn-services/NotRejectedMessageStatusValue";
import { ReadStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ReadStatus";
import { PaymentStatusEnum } from "./generated/fn-services/PaymentStatus";
import { RejectionReasonEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/RejectionReason";
import { TimeToLiveSeconds } from "./generated/fn-services/TimeToLiveSeconds";
import { NewMessageWithoutContent } from "@pagopa/io-functions-commons/dist/src/models/message";
import { isRight } from "fp-ts/lib/Either";
import { ulidGenerator } from "@pagopa/io-functions-commons/dist/src/utils/strings";
import { ProblemJson } from "@pagopa/ts-commons/lib/responses";

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

export const anInvalidMessageContent: MessageContent = {
  markdown: aMessageBodyMarkdown,
  subject: "invalid"
};

const aValidLegalMessageContent = {
  ...aMessageContent,
  legal_data: {
    has_attachment: false,
    message_unique_id: "A_MESSAGE_UNIQUE_ID" as NonEmptyString,
    sender_mail_from: "demo@pec.it" as NonEmptyString
  }
};

const aValidThirdPartyMessageContent = {
  id: "ID"
};

const aValidEuCovidCertMessageContent = {
  auth_code: "auth_code"
};

const aValidPaymentDataMessageContent = {
  amount: 1,
  notice_number: "177777777777777777",
  payee: {
    fiscal_code: "01234567890"
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
): typeof fetch => async (input, init) => {
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

    const problemJson = (await response.json()) as ProblemJson;

    expect(problemJson).toMatchObject({
      detail: "You do not have enough permissions to send a legal message",
      title: "You are not allowed here"
    });
  });

  it("should return 403 when creating a third party message without right permission", async () => {
    const nodeFetch = getNodeFetch({
      "x-user-groups": "ApiMessageWrite"
    });

    const body = {
      message: {
        fiscal_code: anAutoFiscalCode,
        content: {
          ...aMessageContent,
          third_party_data: aValidThirdPartyMessageContent
        }
      }
    };

    const response = await postCreateMessage(nodeFetch)(body);

    expect(response.status).toEqual(403);

    const problemJson = (await response.json()) as ProblemJson;

    expect(problemJson).toMatchObject({
      detail:
        "You do not have enough permissions to send a third party message",
      title: "You are not allowed here"
    });
  });

  it("should return 403 when creating a no ADVANCED third party message with wrong permission", async () => {
    const nodeFetch = getNodeFetch({
      "x-user-groups":
        customHeaders["x-user-groups"] + ",ApiMessageWriteAdvanced"
    });

    const body = {
      message: {
        fiscal_code: anAutoFiscalCode,
        content: {
          ...aMessageContent,
          third_party_data: aValidThirdPartyMessageContent
        }
      }
    };

    const response = await postCreateMessage(nodeFetch)(body);

    expect(response.status).toEqual(403);

    const problemJson = (await response.json()) as ProblemJson;

    expect(problemJson).toMatchObject({
      detail:
        "You do not have enough permissions to send a third party message",
      title: "You are not allowed here"
    });
  });

  it("should return 403 when creating an EUCovidCert message without right permission", async () => {
    const nodeFetch = getNodeFetch({
      "x-user-groups": "ApiMessageWrite"
    });

    const body = {
      message: {
        fiscal_code: anAutoFiscalCode,
        content: {
          ...aMessageContent,
          eu_covid_cert: aValidEuCovidCertMessageContent
        }
      }
    };

    const response = await postCreateMessage(nodeFetch)(body);

    expect(response.status).toEqual(403);

    const problemJson = (await response.json()) as ProblemJson;

    expect(problemJson).toMatchObject({
      detail:
        "You do not have enough permissions to send an EUCovidCert message",
      title: "You are not allowed here"
    });
  });

  it("should return 403 when creating a payment message without right permission", async () => {
    const nodeFetch = getNodeFetch({
      "x-user-groups": "ApiMessageWrite"
    });

    const body = {
      message: {
        fiscal_code: anAutoFiscalCode,
        content: {
          ...aMessageContent,
          payment_data: aValidPaymentDataMessageContent
        }
      }
    };

    const response = await postCreateMessage(nodeFetch)(body);

    expect(response.status).toEqual(403);

    const problemJson = (await response.json()) as ProblemJson;

    expect(problemJson).toMatchObject({
      detail:
        "You do not have enough permissions to send a payment message with payee",
      title: "You are not allowed here"
    });
  });

  it("should return 403 when creating an advanced message without right permission", async () => {
    const nodeFetch = getNodeFetch({
      "x-user-groups": "ApiMessageWrite"
    });

    const body = {
      message: {
        fiscal_code: anAutoFiscalCode,
        feature_level_type: "ADVANCED",
        content: aMessageContent
      }
    };

    const response = await postCreateMessage(nodeFetch)(body);

    expect(response.status).toEqual(403);

    const problemJson = (await response.json()) as ProblemJson;

    expect(problemJson).toMatchObject({
      detail: "You do not have enough permissions to send a Premium message",
      title: "You are not allowed here"
    });
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

  it("should return 201 when creating an ADVANCED third party message with right permission", async () => {
    const nodeFetch = getNodeFetch({
      "x-user-groups":
        customHeaders["x-user-groups"] + ",ApiMessageWriteAdvanced"
    });

    const body = {
      message: {
        fiscal_code: anAutoFiscalCode,
        content: {
          ...aMessageContent,
          third_party_data: aValidThirdPartyMessageContent
        },
        feature_level_type: "ADVANCED"
      }
    };

    const response = await postCreateMessage(nodeFetch)(body);

    expect(response.status).toEqual(201);
  });

  it("should return 201 when creating a third party message with right permission", async () => {
    const nodeFetch = getNodeFetch({
      "x-user-groups":
        customHeaders["x-user-groups"] + ",ApiThirdPartyMessageWrite"
    });

    const body = {
      message: {
        fiscal_code: anAutoFiscalCode,
        content: {
          ...aMessageContent,
          third_party_data: aValidThirdPartyMessageContent
        },
        feature_level_type: "STANDARD"
      }
    };

    const response = await postCreateMessage(nodeFetch)(body);

    expect(response.status).toEqual(201);
  });

  it("should return 400 with simplified validation error when MessagePayloadMiddleware fails", async () => {
    const body = {
      message: {
        fiscal_code: aLegacyInboxEnabledFiscalCode,
        content: anInvalidMessageContent
      }
    };

    const response = await postCreateMessage(getNodeFetch())(body);

    const problemJson = await response.json();

    expect(problemJson).toMatchObject({
      status: 400,
      detail:
        'value "invalid" at root.content.subject is not a valid [string of length >= 10 and < 121]'
    });
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
      const createdMessage = (await result.json()) as CreatedMessage;
      expect(createdMessage).not.toHaveProperty("ttl");

      expect(result.status).toEqual(201);

      const messageId = createdMessage.id;
      expect(messageId).not.toBeUndefined();

      // Wait the process to complete
      await delay(WAIT_MS);

      const resultGet = await getSentMessage(nodeFetch)(fiscalCode, messageId!);

      expect(resultGet.status).toEqual(200);
      const detail = (await resultGet.json()) as ExternalMessageResponseWithContent;

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
          expect(O.getOrElseW(() => undefined)(status)).not.toHaveProperty(
            "ttl"
          );
          expect(O.getOrElseW(() => undefined)(message)).not.toHaveProperty(
            "ttl"
          );
        })
      )();

      expect(detail).toEqual(
        expect.objectContaining({
          message: expect.objectContaining({
            ...body.message,
            id: messageId,
            feature_level_type: FeatureLevelTypeEnum.STANDARD
          }),
          status: NotRejectedMessageStatusValueEnum.PROCESSED
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

          expect(status).toEqual(
            O.some(
              expect.objectContaining({
                status: RejectedMessageStatusValueEnum.REJECTED,
                rejection_reason: RejectionReasonEnum.SERVICE_NOT_ALLOWED
              })
            )
          );
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

  it.skip("should Reject message when user does not exist", async () => {
    const nodeFetch = getNodeFetch({
      "x-subscription-id": aValidServiceId
    });
    const aNonExistingFiscalCode = "XXXBBB01C02D345M" as FiscalCode;

    const body = {
      message: { fiscal_code: aNonExistingFiscalCode, content: aMessageContent }
    };

    const result = await postCreateMessage(nodeFetch)(body);

    expect(result.status).toEqual(201);

    const messageId = ((await result.json()) as CreatedMessage).id;
    expect(messageId).not.toBeUndefined();

    // Wait the process to complete
    await delay(WAIT_MS);

    await pipe(
      {
        message: messageModel.find([
          messageId as NonEmptyString,
          aNonExistingFiscalCode
        ]),
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

        expect(status).toEqual(
          O.some(
            expect.objectContaining({
              status: RejectedMessageStatusValueEnum.REJECTED,
              rejection_reason: RejectionReasonEnum.USER_NOT_FOUND
            })
          )
        );
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
  });
});

describe("Create Third Party Message", () => {
  it.each`
    profileType         | fiscalCode                       | serviceId
    ${"AUTO Profile"}   | ${anAutoFiscalCode}              | ${anEnabledServiceId}
    ${"LEGACY Profile"} | ${aLegacyInboxEnabledFiscalCode} | ${anEnabledServiceId}
    ${"MANUAL Profile"} | ${aManualFiscalCode}             | ${anEnabledServiceId}
  `(
    "$profileType |> should return the message in PROCESSED status when service is allowed to send",
    async ({ fiscalCode, serviceId }) => {
      const body = {
        message: {
          fiscal_code: fiscalCode,
          content: {
            ...aMessageContent,
            third_party_data: aValidThirdPartyMessageContent
          }
        }
      };

      const nodeFetch = getNodeFetch({
        "x-subscription-id": serviceId,
        "x-user-groups":
          customHeaders["x-user-groups"] + ",ApiThirdPartyMessageWrite"
      });

      const result = await postCreateMessage(nodeFetch)(body);
      const createdMessage = (await result.json()) as CreatedMessage;
      expect(createdMessage).not.toHaveProperty("ttl");

      expect(result.status).toEqual(201);

      const messageId = createdMessage.id;
      expect(messageId).not.toBeUndefined();

      // Wait the process to complete
      await delay(WAIT_MS);

      const resultGet = await getSentMessage(nodeFetch)(fiscalCode, messageId!);

      expect(resultGet.status).toEqual(200);
      const detail = (await resultGet.json()) as ExternalMessageResponseWithContent;

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
          expect(O.getOrElseW(() => undefined)(status)).not.toHaveProperty(
            "ttl"
          );
          expect(O.getOrElseW(() => undefined)(message)).not.toHaveProperty(
            "ttl"
          );
        })
      )();

      expect(detail).toEqual(
        expect.objectContaining({
          message: expect.objectContaining({
            ...body.message,
            feature_level_type: FeatureLevelTypeEnum.STANDARD,
            content: {
              ...body.message.content,
              third_party_data: {
                ...body.message.content.third_party_data,
                has_attachments: false
              }
            }
          }),
          status: NotRejectedMessageStatusValueEnum.PROCESSED
        })
      );
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

      const nodeFetchWithoutPermission = getNodeFetch({
        "x-subscription-id": serviceId
      });
      const nodeFetch = getNodeFetch({
        "x-subscription-id": serviceId,
        "x-user-groups":
          customHeaders["x-user-groups"] +
          ",ApiMessageWriteAdvanced,ApiMessageReadAdvanced"
      });

      const result = await postCreateMessage(nodeFetch)(body);
      const createdMessage = (await result.json()) as CreatedMessage;
      expect(createdMessage).not.toHaveProperty("ttl");

      expect(result.status).toEqual(201);

      const messageId = createdMessage.id;
      expect(messageId).not.toBeUndefined();

      // Wait the process to complete
      await delay(WAIT_MS);

      // Check response having `ApiMessageReadAdvanced` authorization

      const resultGet = await getSentMessage(nodeFetch)(fiscalCode, messageId!);

      expect(resultGet.status).toEqual(200);
      const detail = (await resultGet.json()) as ExternalMessageResponseWithContent;

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
          expect(O.getOrElseW(() => undefined)(status)).not.toHaveProperty(
            "ttl"
          );
          expect(O.getOrElseW(() => undefined)(message)).not.toHaveProperty(
            "ttl"
          );
        })
      )();

      expect(detail).toMatchObject(
        expect.objectContaining({
          message: expect.objectContaining({
            ...body.message,
            id: messageId,
            feature_level_type: FeatureLevelTypeEnum.ADVANCED
          }),
          status: NotRejectedMessageStatusValueEnum.PROCESSED,
          read_status:
            fiscalCode === aLegacyInboxEnabledFiscalCode
              ? ReadStatusEnum.UNAVAILABLE
              : ReadStatusEnum.UNREAD
        })
      );

      expect(detail).not.toHaveProperty("payment_status");

      // Check response without having `ApiMessageReadAdvanced` authorization

      const resultGetWithoutPermission = await getSentMessage(
        nodeFetchWithoutPermission
      )(fiscalCode, messageId!);

      expect(resultGetWithoutPermission.status).toEqual(200);
      const detailWithoutPermission = (await resultGetWithoutPermission.json()) as ExternalMessageResponseWithContent;

      expect(detailWithoutPermission).toMatchObject(
        expect.objectContaining({
          message: expect.objectContaining({
            ...body.message,
            id: messageId
          }),
          status: NotRejectedMessageStatusValueEnum.PROCESSED
        })
      );

      expect(detailWithoutPermission).not.toHaveProperty("payment_status");
      expect(detailWithoutPermission).not.toHaveProperty("read_status");
    }
  );

  // This code is testing the case in which user explicitly disabled a service
  // servicePreference in DENY state is defined in fixtures project
  it("should return the message WITHOUT Read status, if user is NOT allowed to read it", async () => {
    const fiscalCode = anAutoFiscalCode;
    const serviceId = aValidServiceId;

    const body = {
      message: {
        fiscal_code: fiscalCode,
        feature_level_type: "ADVANCED",
        content: aMessageContent
      }
    };

    const nodeFetchWithoutPermission = getNodeFetch({
      "x-subscription-id": serviceId
    });
    const nodeFetch = getNodeFetch({
      "x-subscription-id": serviceId,
      "x-user-groups":
        customHeaders["x-user-groups"] +
        ",ApiMessageWriteAdvanced,ApiMessageReadAdvanced"
    });

    const result = await postCreateMessage(nodeFetch)(body);
    const createdMessage = (await result.json()) as CreatedMessage;
    expect(createdMessage).not.toHaveProperty("ttl");

    expect(result.status).toEqual(201);

    const messageId = createdMessage.id;
    expect(messageId).not.toBeUndefined();

    // Wait the process to complete
    await delay(WAIT_MS);

    // Check response having `ApiMessageReadAdvanced` authorization
    const resultGet = await getSentMessage(nodeFetch)(fiscalCode, messageId!);

    expect(resultGet.status).toEqual(200);
    const detail = (await resultGet.json()) as ExternalMessageResponseWithContent;

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
        expect(O.getOrElseW(() => undefined)(status)).not.toHaveProperty("ttl");
        expect(O.getOrElseW(() => undefined)(status)).not.toHaveProperty("ttl");
      })
    )();

    expect(detail).toMatchObject(
      expect.objectContaining({
        message: expect.objectContaining({
          ...body.message,
          id: messageId
        }),
        status: NotRejectedMessageStatusValueEnum.PROCESSED,
        read_status: ReadStatusEnum.UNAVAILABLE
      })
    );

    // Check response without having `ApiMessageReadAdvanced` authorization

    const resultGetWithoutPermission = await getSentMessage(
      nodeFetchWithoutPermission
    )(fiscalCode, messageId!);

    expect(resultGetWithoutPermission.status).toEqual(200);
    const detailWithoutPermission = (await resultGetWithoutPermission.json()) as ExternalMessageResponseWithContent;

    expect(detailWithoutPermission).toMatchObject(
      expect.objectContaining({
        message: expect.objectContaining({
          ...body.message,
          id: messageId
        }),
        status: NotRejectedMessageStatusValueEnum.PROCESSED
      })
    );

    expect(detailWithoutPermission).not.toHaveProperty("payment_status");
    expect(detailWithoutPermission).not.toHaveProperty("read_status");
  });

  // TODO: Enable when paymentStatus will be available
  it.skip("should return the PAYMENT message with payment_status, if user is allowed to read it", async () => {
    const fiscalCode = anAutoFiscalCode;
    const serviceId = anEnabledServiceId;

    const body = {
      message: {
        fiscal_code: fiscalCode,
        feature_level_type: "ADVANCED",
        content: {
          ...aMessageContent,
          payment_data: {
            amount: 70,
            notice_number: "177777777777777777"
          }
        }
      }
    };

    const nodeFetchWithoutPermission = getNodeFetch({
      "x-subscription-id": serviceId
    });
    const nodeFetch = getNodeFetch({
      "x-subscription-id": serviceId,
      "x-user-groups":
        customHeaders["x-user-groups"] +
        ",ApiMessageWriteAdvanced,ApiMessageReadAdvanced"
    });

    const result = await postCreateMessage(nodeFetch)(body);

    expect(result.status).toEqual(201);

    const messageId = ((await result.json()) as CreatedMessage).id;
    expect(messageId).not.toBeUndefined();

    // Wait the process to complete
    await delay(WAIT_MS);

    // Check response having `ApiMessageReadAdvanced` authorization

    const resultGet = await getSentMessage(nodeFetch)(fiscalCode, messageId!);

    expect(resultGet.status).toEqual(200);
    const detail = (await resultGet.json()) as ExternalMessageResponseWithContent;

    expect(detail).toMatchObject(
      expect.objectContaining({
        message: expect.objectContaining({
          ...body.message,
          id: messageId
        }),
        status: NotRejectedMessageStatusValueEnum.PROCESSED,
        read_status: ReadStatusEnum.UNAVAILABLE,
        payment_status: PaymentStatusEnum.NOT_PAID
      })
    );

    // Check response without having `ApiMessageReadAdvanced` authorization

    const resultGetWithoutPermission = await getSentMessage(
      nodeFetchWithoutPermission
    )(fiscalCode, messageId!);

    expect(resultGetWithoutPermission.status).toEqual(200);
    const detailWithoutPermission = (await resultGetWithoutPermission.json()) as ExternalMessageResponseWithContent;

    expect(detailWithoutPermission).toMatchObject(
      expect.objectContaining({
        message: expect.objectContaining({
          ...body.message,
          id: messageId
        }),
        status: NotRejectedMessageStatusValueEnum.PROCESSED
      })
    );

    expect(detailWithoutPermission).not.toHaveProperty("payment_status");
    expect(detailWithoutPermission).not.toHaveProperty("read_status");
  });
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

const aMessageId = ulidGenerator();
const aSerializedNewMessageWithoutContent = {
  createdAt: new Date().toISOString(),
  featureLevelType: FeatureLevelTypeEnum.STANDARD,
  fiscalCode: anAutoFiscalCode,
  id: aMessageId,
  indexedId: aMessageId,
  senderServiceId: aValidServiceId,
  senderUserId: "u123" as NonEmptyString,
  timeToLiveSeconds: 3600 as TimeToLiveSeconds
};
const aNewMessageWithoutContent: NewMessageWithoutContent = {
  ...aSerializedNewMessageWithoutContent,
  createdAt: new Date(),
  kind: "INewMessageWithoutContent"
};

describe("Get Message", () => {
  //ENABLE ME when Azurite will proper support the 404 error when retrieving a missing blob
  it.skip("Get existing message without content in ACCEPTED state", async () => {
    const createResult = await messageModel.create(aNewMessageWithoutContent)();
    expect(E.isRight(createResult)).toBeTruthy();

    const nodeFetch = getNodeFetch({ "x-subscription-id": aValidServiceId });
    const result = await getSentMessage(nodeFetch)(
      anAutoFiscalCode,
      aMessageId
    );
    expect(result.status).toEqual(200);
  });
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
