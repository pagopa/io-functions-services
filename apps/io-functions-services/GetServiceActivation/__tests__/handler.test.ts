/* eslint-disable vitest/no-mocks-import */
import { InvocationContext } from "@azure/functions";
import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import { SpecialServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/SpecialServiceCategory";
import { ActivationModel } from "@pagopa/io-functions-commons/dist/src/models/activation";
import { Service } from "@pagopa/io-functions-commons/dist/src/models/service";
import { toApiServiceActivation } from "@pagopa/io-functions-commons/dist/src/utils/activations";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { ClientIp } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { Response } from "express";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  aFiscalCode,
  anActivation,
  anAzureApiAuthorization,
  anAzureUserAttributes,
  aValidService
} from "../../__mocks__/mocks";
import mockRes from "../../__mocks__/response";
import { GetServiceActivationHandler } from "../handler";

const mockActivationFind = vi.fn();
const mockActivationModel = {
  findLastVersionByModelId: mockActivationFind
} as unknown as ActivationModel;

const aSpecialService: Service & { version: NonNegativeInteger } = {
  ...aValidService,
  serviceMetadata: {
    category: SpecialServiceCategoryEnum.SPECIAL,
    scope: ServiceScopeEnum.LOCAL
  },
  version: 1 as NonNegativeInteger
};

const mockContext = {
  // eslint-disable no-console
  functionName: "GetServiceActivation",
  error: console.error
} as unknown as InvocationContext;
describe("GetServiceActivationHandler", () => {
  const mockExpressResponse: Response = mockRes();

  beforeEach(() => {
    vi.clearAllMocks();
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
      activationResult,
      responseKind,
      responsePayload,
      skipActivationMock = activationResult === "not-called",
      skipResponsePayloadCheck = responsePayload === "skip-check",
      userAttributes
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      !skipActivationMock &&
        mockActivationFind.mockImplementationOnce(() => activationResult);
      const getServiceActivationHandler =
        GetServiceActivationHandler(mockActivationModel);
      const result = await getServiceActivationHandler(
        mockContext,
        anAzureApiAuthorization,
        "0.0.0.0/0" as unknown as ClientIp,
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
