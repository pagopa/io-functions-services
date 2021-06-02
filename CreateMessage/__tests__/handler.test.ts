/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fc from "fast-check";

import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";

import { none, some } from "fp-ts/lib/Option";

import {
  canDefaultAddresses,
  canPaymentAmount,
  canWriteMessage,
  createMessageDocument,
  CreateMessageHandler,
  forkOrchestrator
} from "../handler";

import { taskEither } from "fp-ts/lib/TaskEither";
import {
  alphaStringArb,
  emailStringArb,
  fiscalCodeArb,
  fiscalCodeArrayArb,
  fiscalCodeSetArb,
  maxAmountArb,
  messageTimeToLiveArb,
  newMessageArb,
  newMessageWithDefaultEmailArb,
  newMessageWithoutContentArb,
  newMessageWithPaymentDataArb,
  versionedServiceArb
} from "../../utils/__tests__/arbitraries";
import { EmailString, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import {
  aFiscalCode,
  anIncompleteService,
  anotherFiscalCode
} from "../../__mocks__/mocks";
import { initAppInsights } from "italia-ts-commons/lib/appinsights";
import { mockOrchestratorContext } from "../../__mocks__/durable-functions";
import { ApiNewMessageWithDefaults } from "../types";

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
          expect(response.isLeft()).toBeTruthy();
          if (response.isLeft()) {
            expect(response.value.kind).toEqual(
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
          expect(response.isLeft()).toBeTruthy();
          if (response.isLeft()) {
            expect(response.value.kind).toEqual(
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
          expect(response.isRight()).toBeTruthy();
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
          expect(response.isRight()).toBeTruthy();
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
        expect(response.isLeft()).toBeTruthy();
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
          const response = canPaymentAmount(message.content, maxAmount);
          if (message.content.payment_data.amount <= maxAmount) {
            expect(response.isRight()).toBeTruthy();
          } else {
            expect(response.isLeft()).toBeTruthy();
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
        serviceIdArb,
        async (messageId, senderUserId, fiscalCode, ttl, senderServiceId) => {
          const mockMessageModel = ({
            create: jest.fn(() => taskEither.of({}))
          } as unknown) as MessageModel;
          const responseTask = createMessageDocument(
            messageId,
            mockMessageModel,
            senderUserId,
            fiscalCode,
            ttl,
            senderServiceId
          );

          const response = await responseTask.run();

          expect(mockMessageModel.create).toHaveBeenCalledTimes(1);
          expect(response.isRight()).toBeTruthy();
          expect(response.getOrElse(undefined)).toMatchObject({
            fiscalCode,
            id: messageId,
            indexedId: messageId,
            isPending: true,
            kind: "INewMessageWithoutContent",
            senderServiceId,
            senderUserId,
            timeToLiveSeconds: ttl
          });
        }
      )
    );
  });
});

describe("forkOrchestrator", () => {
  it("should fork a durable orchestrator", async () => {
    await fc.assert(
      fc.asyncProperty(
        newMessageArb,
        newMessageWithoutContentArb,
        versionedServiceArb,
        emailStringArb,
        async (
          newMessage,
          newMessageWithoutContent,
          service,
          serviceUserEmail
        ) => {
          const mockDfClient = {
            startNew: jest.fn(() => Promise.resolve("orchestratorId"))
          };
          const getDfClient = jest.fn(() => mockDfClient);
          const response = await forkOrchestrator(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getDfClient as any,
            newMessage.content,
            service,
            newMessageWithoutContent,
            serviceUserEmail
          ).run();
          expect(response.isRight()).toBeTruthy();
          expect(getDfClient).toHaveBeenCalledTimes(1);
          expect(mockDfClient.startNew).toHaveBeenCalledTimes(1);
          expect(mockDfClient.startNew).toHaveBeenCalledWith(
            "CreatedMessageOrchestrator",
            undefined,
            expect.objectContaining({
              content: newMessage.content,
              defaultAddresses: {}, // deprecated feature
              message: newMessageWithoutContent,
              senderMetadata: {
                departmentName: service.departmentName,
                organizationFiscalCode: service.organizationFiscalCode,
                organizationName: service.organizationName,
                requireSecureChannels: service.requireSecureChannels,
                serviceName: service.serviceName,
                serviceUserEmail
              },
              serviceVersion: service.version
            })
          );
          expect(response.getOrElse(undefined)).toEqual("orchestratorId");
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
    const createMessageHandler = CreateMessageHandler(
      mockTelemetryClient,
      undefined as any,
      mockGenerateObjId,
      true,
      []
    );

    const response = await createMessageHandler(
      mockOrchestratorContext,
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
