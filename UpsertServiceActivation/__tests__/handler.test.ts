import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import { SpecialServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/SpecialServiceCategory";
import { ActivationModel } from "@pagopa/io-functions-commons/dist/src/models/activation";
import { Service } from "@pagopa/io-functions-commons/dist/src/models/service";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { UpsertServiceActivationHandler } from "../handler";
import * as TE from "fp-ts/lib/TaskEither";
import { Context } from "@azure/functions";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  aFiscalCode,
  anActivation,
  anAzureApiAuthorization,
  anAzureUserAttributes,
  aServiceId,
  aValidService
} from "../../__mocks__/mocks";
import { toApiServiceActivation } from "@pagopa/io-functions-commons/dist/src/utils/activations";
import mockRes from "../../__mocks__/response";
import { Response } from "express";
import { ActivationStatusEnum } from "../../generated/definitions/ActivationStatus";

const mockActivationUpsert = jest.fn();
const mockActivationModel = ({
  upsert: mockActivationUpsert
} as unknown) as ActivationModel;

const aSpecialService: Service & { version: NonNegativeInteger } = {
  ...aValidService,
  version: 1 as NonNegativeInteger,
  serviceMetadata: {
    category: SpecialServiceCategoryEnum.SPECIAL,
    scope: ServiceScopeEnum.LOCAL
  }
};

const mockContext = {
  // eslint-disable no-console
  log: {
    error: console.error
  },
  executionContext: {
    functionName: "UpsertServiceActivation"
  }
} as Context;
describe("UpsertServiceActivationHandler", () => {
  const mockExpressResponse: Response = mockRes();

  beforeEach(() => {
    jest.clearAllMocks();
  });
  it.each`
    scenario                                              | userAttributes                                            | activationUpsertResult                                        | responseKind                              | responsePayload
    ${"unauthorized if the service isn't SPECIAL"}        | ${anAzureUserAttributes}                                  | ${"not-called"}                                               | ${"IResponseErrorForbiddenNotAuthorized"} | ${"skip-check"}
    ${"the activation if present on database"}            | ${{ ...anAzureUserAttributes, service: aSpecialService }} | ${TE.of(anActivation)}                                        | ${"IResponseSuccessJson"}                 | ${toApiServiceActivation(anActivation)}
    ${"query error response if reading activation fails"} | ${{ ...anAzureUserAttributes, service: aSpecialService }} | ${TE.left(toCosmosErrorResponse(new Error("reading error")))} | ${"IResponseErrorQuery"}                  | ${"skip-check"}
  `(
    "should returns $scenario",
    async ({
      userAttributes,
      responseKind,
      activationUpsertResult,
      responsePayload,
      skipActivationUpsertMock = activationUpsertResult === "not-called",
      skipResponsePayloadCheck = responsePayload === "skip-check"
    }) => {
      !skipActivationUpsertMock &&
        mockActivationUpsert.mockImplementationOnce(
          () => activationUpsertResult
        );
      const upsertServiceActivationHandler = UpsertServiceActivationHandler(
        mockActivationModel
      );
      const result = await upsertServiceActivationHandler(
        mockContext,
        anAzureApiAuthorization,
        undefined,
        userAttributes,
        {
          fiscal_code: aFiscalCode,
          service_id: aServiceId,
          status: ActivationStatusEnum.ACTIVE,
          version: 1 as NonNegativeInteger
        }
      );
      expect(result.kind).toBe(responseKind);
      if (!skipResponsePayloadCheck) {
        result.apply(mockExpressResponse);
        expect(mockExpressResponse.json).toHaveBeenCalledWith(responsePayload);
      }
      expect(mockActivationUpsert).toBeCalledTimes(
        skipActivationUpsertMock ? 0 : 1
      );
    }
  );
});
