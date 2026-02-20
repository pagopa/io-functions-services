import { InvocationContext } from "@azure/functions";
import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import { SpecialServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/SpecialServiceCategory";
import { ActivationModel } from "@pagopa/io-functions-commons/dist/src/models/activation";
import { Service } from "@pagopa/io-functions-commons/dist/src/models/service";
import { toApiServiceActivation } from "@pagopa/io-functions-commons/dist/src/utils/activations";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { ClientIp } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import * as TE from "fp-ts/lib/TaskEither";
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import {
  aFiscalCode,
  anActivation,
  anAzureApiAuthorization,
  anAzureUserAttributes,
  aServiceId,
  aValidService
} from "../../__mocks__/mocks";
// eslint-disable-next-line vitest/no-mocks-import
import mockRes from "../../__mocks__/response";
import { ActivationStatusEnum } from "../../generated/definitions/ActivationStatus";
import { UpsertServiceActivationHandler } from "../handler";

const mockActivationUpsert = vi.fn();
const mockActivationModel = {
  upsert: mockActivationUpsert
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
  functionName: "UpsertServiceActivation",
  error: console.error
} as unknown as InvocationContext;
describe("UpsertServiceActivationHandler", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockExpressResponse: any = mockRes();

  beforeEach(() => {
    vi.clearAllMocks();
  });
  it.each`
    scenario                                              | userAttributes                                            | activationUpsertResult                                        | responseKind                              | responsePayload
    ${"unauthorized if the service isn't SPECIAL"}        | ${anAzureUserAttributes}                                  | ${"not-called"}                                               | ${"IResponseErrorForbiddenNotAuthorized"} | ${"skip-check"}
    ${"the activation if present on database"}            | ${{ ...anAzureUserAttributes, service: aSpecialService }} | ${TE.of(anActivation)}                                        | ${"IResponseSuccessJson"}                 | ${toApiServiceActivation(anActivation)}
    ${"query error response if reading activation fails"} | ${{ ...anAzureUserAttributes, service: aSpecialService }} | ${TE.left(toCosmosErrorResponse(new Error("reading error")))} | ${"IResponseErrorQuery"}                  | ${"skip-check"}
  `(
    "should returns $scenario",
    async ({
      activationUpsertResult,
      responseKind,
      responsePayload,
      skipActivationUpsertMock = activationUpsertResult === "not-called",
      skipResponsePayloadCheck = responsePayload === "skip-check",
      userAttributes
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      !skipActivationUpsertMock &&
        mockActivationUpsert.mockImplementationOnce(
          () => activationUpsertResult
        );
      const upsertServiceActivationHandler =
        UpsertServiceActivationHandler(mockActivationModel);
      const result = await upsertServiceActivationHandler(
        mockContext,
        anAzureApiAuthorization,
        "0.0.0.0/0" as unknown as ClientIp,
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
