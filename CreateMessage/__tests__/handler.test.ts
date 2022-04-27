/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fc from "fast-check";

import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";

import { none, some } from "fp-ts/lib/Option";

import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

import {
  canDefaultAddresses,
  canPaymentAmount,
  canWriteMessage,
  createMessageDocument,
  CreateMessageHandler
} from "../handler";

import {
  alphaStringArb,
  featureTypeArb,
  fiscalCodeArb,
  fiscalCodeArrayArb,
  fiscalCodeSetArb,
  maxAmountArb,
  messageTimeToLiveArb,
  newMessageWithDefaultEmailArb,
  newMessageWithPaymentDataArb
} from "../../utils/__tests__/arbitraries";
import { EmailString, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import {
  aFiscalCode,
  anIncompleteService,
  anotherFiscalCode
} from "../../__mocks__/mocks";
import { initAppInsights } from "@pagopa/ts-commons/lib/appinsights";
import { ApiNewMessageWithDefaults } from "../types";
import { Context } from "@azure/functions";

const createContext = (): Context =>
  (({
    bindings: {},
    executionContext: { functionName: "funcname" },
    // eslint-disable no-console
    log: { ...console, verbose: console.log }
  } as unknown) as Context);

//
// tests
//

describe("canWriteMessage", () => {
  it("should respond with ResponseErrorForbiddenNotAuthorizedForProduction when service is in no group", () => {
    fc.assert(
      fc.property(
        fiscalCodeArrayArb,
        fiscalCodeArb,
        fc.boolean(),
        (authorizedRecipients, recipient, isAuthorized) => {
          const response = canWriteMessage(
            new Set(), // no groups
            new Set(
              authorizedRecipients.concat(isAuthorized ? [recipient] : [])
            ), // any authorized recipient, possibly also the current one
            recipient // one random recipient
          );
          expect(E.isLeft(response)).toBeTruthy();
          if (E.isLeft(response)) {
            expect(response.left.kind).toEqual(
              "IResponseErrorForbiddenNotAuthorizedForProduction"
            );
          }
        }
      )
    );
  });

  it("should respond with ResponseErrorForbiddenNotAuthorizedForRecipient when service is trying to send message to an unauthorized recipient", () => {
    fc.assert(
      fc.property(
        fiscalCodeArrayArb,
        fiscalCodeArb,
        (authorizedRecipients, recipient) => {
          const response = canWriteMessage(
            new Set([UserGroup.ApiLimitedMessageWrite]),
            new Set(authorizedRecipients.filter(_ => _ !== recipient)), // current recipient is not authorized
            recipient
          );
          expect(E.isLeft(response)).toBeTruthy();
          if (E.isLeft(response)) {
            expect(response.left.kind).toEqual(
              "IResponseErrorForbiddenNotAuthorizedForRecipient"
            );
          }
        }
      )
    );
  });

  it("should pass when service is trying to send message to an authorized recipient", () => {
    fc.assert(
      fc.property(
        fiscalCodeArrayArb,
        fiscalCodeArb,
        (authorizedRecipients, recipient) => {
          const response = canWriteMessage(
            new Set([UserGroup.ApiLimitedMessageWrite]),
            new Set([...authorizedRecipients, recipient]), // current recipient always authorized
            recipient
          );
          expect(E.isRight(response)).toBeTruthy();
        }
      )
    );
  });

  it("should pass when service can send messages to any recipient", () => {
    fc.assert(
      fc.property(
        fiscalCodeSetArb,
        fiscalCodeArb,
        (authorizedRecipients, recipient) => {
          const response = canWriteMessage(
            new Set([UserGroup.ApiMessageWrite]),
            authorizedRecipients,
            recipient
          );
          expect(E.isRight(response)).toBeTruthy();
        }
      )
    );
  });
});

describe("canDefaultAddresses", () => {
  it("should always respond with ResponseErrorForbiddenNotAuthorizedForDefaultAddresses when default addresses are provided", () => {
    fc.assert(
      fc.property(newMessageWithDefaultEmailArb, m => {
        const response = canDefaultAddresses(m);
        expect(E.isLeft(response)).toBeTruthy();
      })
    );
  });
});

describe("canPaymentAmount", () => {
  it("should authorize payment if under the allowed amount", () => {
    fc.assert(
      fc.property(
        newMessageWithPaymentDataArb,
        maxAmountArb,
        (message, maxAmount) => {
          const p = message.content.payment_data;

          const response = canPaymentAmount(message.content, maxAmount);
          if (message.content.payment_data.amount <= maxAmount) {
            expect(E.isRight(response)).toBeTruthy();
          } else {
            expect(E.isLeft(response)).toBeTruthy();
          }
        }
      )
    );
  });
});

describe("createMessageDocument", () => {
  const messageIdArb = alphaStringArb(16);
  const senderUserIdArb = alphaStringArb(16);
  const serviceIdArb = alphaStringArb(16);

  it("should create a Message document", async () => {
    await fc.assert(
      fc.asyncProperty(
        messageIdArb,
        senderUserIdArb,
        fiscalCodeArb,
        messageTimeToLiveArb,
        featureTypeArb,
        serviceIdArb,
        async (
          messageId,
          senderUserId,
          fiscalCode,
          ttl,
          featureType,
          senderServiceId
        ) => {
          const mockMessageModel = ({
            create: jest.fn(() => TE.of({}))
          } as unknown) as MessageModel;
          const responseTask = createMessageDocument(
            messageId,
            mockMessageModel,
            senderUserId,
            fiscalCode,
            ttl,
            featureType,
            senderServiceId
          );

          const response = await responseTask();

          expect(mockMessageModel.create).toHaveBeenCalledTimes(1);
          expect(E.isRight(response)).toBeTruthy();
          expect(pipe(response, E.getOrElse(undefined))).toMatchObject({
            fiscalCode,
            id: messageId,
            indexedId: messageId,
            isPending: true,
            kind: "INewMessageWithoutContent",
            senderServiceId,
            senderUserId,
            timeToLiveSeconds: ttl
            // TODO
            // featureType
          });
        }
      )
    );
  });
});

describe("CreateMessageHandler", () => {
  it("should return a validation error if fiscalcode is specified both in path and payload", async () => {
    await fc.assert(
      fc.asyncProperty(fiscalCodeArb, async fiscalCode => {
        const createMessageHandler = CreateMessageHandler(
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          true,
          []
        );

        const response = await createMessageHandler(
          undefined as any,
          undefined as any,
          undefined as any,
          undefined as any,
          {
            fiscal_code: fiscalCode
          } as any,
          some(fiscalCode)
        );

        expect(response.kind).toBe("IResponseErrorValidation");
      })
    );
  });

  it("should return a validation error if fiscalcode is not specified in path nor payload", async () => {
    const createMessageHandler = CreateMessageHandler(
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      true,
      []
    );

    const response = await createMessageHandler(
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      {} as any,
      none
    );

    expect(response.kind).toBe("IResponseErrorValidation");
  });

  it("should return IResponseErrorForbiddenNotAuthorizedForProduction if the service hasn't quality field", async () => {
    const mockAzureApiAuthorization: IAzureApiAuthorization = {
      groups: new Set([UserGroup.ApiMessageWrite]),
      kind: "IAzureApiAuthorization",
      subscriptionId: "" as NonEmptyString,
      userId: "" as NonEmptyString
    };

    const mockAzureUserAttributes: IAzureUserAttributes = {
      email: "" as EmailString,
      kind: "IAzureUserAttributes",
      service: {
        ...anIncompleteService,
        authorizedRecipients: new Set([aFiscalCode])
      } as IAzureUserAttributes["service"]
    };
    const mockGenerateObjId = jest
      .fn()
      .mockImplementationOnce(() => "mocked-message-id");
    const mockTelemetryClient = ({
      trackEvent: jest.fn()
    } as unknown) as ReturnType<typeof initAppInsights>;

    const mockSaveBlob = jest.fn((_: string, __: any) =>
      TE.of(O.some({} as any))
    );
    const createMessageHandler = CreateMessageHandler(
      mockTelemetryClient,
      undefined as any,
      mockGenerateObjId,
      mockSaveBlob,
      true,
      []
    );

    const response = await createMessageHandler(
      createContext(),
      mockAzureApiAuthorization,
      undefined as any,
      mockAzureUserAttributes,
      {
        content: {
          markdown: "md",
          subject: "subject"
        }
      } as ApiNewMessageWithDefaults,
      some(anotherFiscalCode)
    );

    expect(response.kind).toBe(
      "IResponseErrorForbiddenNotAuthorizedForRecipient"
    );
  });
});
