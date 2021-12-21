import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import { SpecialServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/SpecialServiceCategory";
import { ActivationModel } from "@pagopa/io-functions-commons/dist/src/models/activation";
import { Service } from "@pagopa/io-functions-commons/dist/src/models/service";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { GetServiceActivationHandler } from "../handler";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";
import { Context } from "@azure/functions";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  aFiscalCode,
  anActivation,
  anAzureApiAuthorization,
  anAzureUserAttributes,
  aValidService
} from "../../__mocks__/mocks";
import { toApiServiceActivation } from "@pagopa/io-functions-commons/dist/src/utils/activations";
import mockRes from "../../__mocks__/response";
import { Response } from "express";

const mockActivationFind = jest.fn();
const mockActivationModel = ({
  findLastVersionByModelId: mockActivationFind
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
    functionName: "GetServiceActivation"
  }
} as Context;
describe("GetServiceActivationHandler", () => {
  const mockExpressResponse: Response = mockRes();

  beforeEach(() => {
    jest.clearAllMocks();
  });
  it.each`
    scenario                                              | userAttributes                                            | activationResult                                              | responseKind                              | responsePayload
    ${"unauthorized if the service isn't SPECIAL"}        | ${anAzureUserAttributes}                                  | ${"not-called"}                                               | ${"IResponseErrorForbiddenNotAuthorized"} | ${"skip-check"}
    ${"not found if the activation is missing"}           | ${{ ...anAzureUserAttributes, service: aSpecialService }} | ${TE.of(O.none)}                                              | ${"IResponseErrorNotFound"}               | ${"skip-check"}
    ${"the activation if present on database"}            | ${{ ...anAzureUserAttributes, service: aSpecialService }} | ${TE.of(O.some(anActivation))}                                | ${"IResponseSuccessJson"}                 | ${toApiServiceActivation(anActivation)}
    ${"query error response if reading activation fails"} | ${{ ...anAzureUserAttributes, service: aSpecialService }} | ${TE.left(toCosmosErrorResponse(new Error("reading error")))} | ${"IResponseErrorQuery"}                  | ${"skip-check"}
  `(
    "should returns $scenario",
    async ({
      userAttributes,
      responseKind,
      activationResult,
      responsePayload,
      skipActivationMock = activationResult === "not-called",
      skipResponsePayloadCheck = responsePayload === "skip-check"
    }) => {
      !skipActivationMock &&
        mockActivationFind.mockImplementationOnce(() => activationResult);
      const getServiceActivationHandler = GetServiceActivationHandler(
        mockActivationModel
      );
      const result = await getServiceActivationHandler(
        mockContext,
        anAzureApiAuthorization,
        undefined,
        userAttributes,
        { fiscal_code: aFiscalCode }
      );
      expect(result.kind).toBe(responseKind);
      if (!skipResponsePayloadCheck) {
        result.apply(mockExpressResponse);
        expect(mockExpressResponse.json).toHaveBeenCalledWith(responsePayload);
      }
      expect(mockActivationFind).toBeCalledTimes(skipActivationMock ? 0 : 1);
    }
  );
});
