import * as express from "express";

import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import {
  AzureUserAttributesMiddleware,
  IAzureUserAttributes
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import {
  ClientIp,
  ClientIpMiddleware
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";

import {
  ActivationModel,
  NewActivation
} from "@pagopa/io-functions-commons/dist/src/models/activation";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorized,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";
import { SpecialServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/SpecialServiceCategory";
import { toApiServiceActivation } from "@pagopa/io-functions-commons/dist/src/utils/activations";
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { initTelemetryClient } from "../utils/appinsights";
import { Activation } from "../generated/definitions/Activation";

export type IUpertActivationFailureResponses =
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseErrorInternal
  | IResponseErrorForbiddenNotAuthorized;
export type IUpsertActivationResponses =
  | IResponseSuccessJson<Activation>
  | IUpertActivationFailureResponses;

/**
 * Type of a IGetActivationByPOST handler.
 *
 * GetServiceActivation expects a FiscalCode as input (in the body) and returns an Activation or a NotFound error.
 */
type IUpsertActivationByPOSTHandler = (
  apiAuthorization: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  payload: Activation
) => Promise<IUpsertActivationResponses>;

const toModelServiceActivation = (
  apiActivation: Activation
): NewActivation => ({
  fiscalCode: apiActivation.fiscal_code,
  kind: "INewActivation",
  serviceId: apiActivation.service_id,
  status: apiActivation.status
});

/**
 * Returns a type safe GetActivationByPOST handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpsertServiceActivationHandler(
  activationModel: ActivationModel,
  _1: ReturnType<typeof initTelemetryClient>
): IUpsertActivationByPOSTHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (_auth, __, userAttributes, newActivation) =>
    pipe(
      O.fromNullable(userAttributes.service.serviceMetadata),
      O.filter(
        serviceMetadata =>
          serviceMetadata.category === SpecialServiceCategoryEnum.SPECIAL
      ),
      TE.fromOption(() => ResponseErrorForbiddenNotAuthorized),
      TE.chainW(_ =>
        pipe(
          activationModel.upsert(toModelServiceActivation(newActivation)),
          TE.mapLeft(error =>
            ResponseErrorQuery("Error reading service Activation", error)
          )
        )
      ),
      TE.map(_ => ResponseSuccessJson(toApiServiceActivation(_))),
      TE.toUnion
    )();
}

/**
 * Wraps a GetServiceActivation handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpsertServiceActivation(
  serviceModel: ServiceModel,
  activationModel: ActivationModel,
  telemetryClient: ReturnType<typeof initTelemetryClient>
): express.RequestHandler {
  const handler = UpsertServiceActivationHandler(
    activationModel,
    telemetryClient
  );

  const middlewaresWrap = withRequestMiddlewares(
    AzureApiAuthMiddleware(new Set([UserGroup.ApiMessageWrite])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    RequiredBodyPayloadMiddleware(Activation)
  );

  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, c, u, __) => ipTuple(c, u))
    )
  );
}
