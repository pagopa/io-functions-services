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

import { ActivationModel } from "@pagopa/io-functions-commons/dist/src/models/activation";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";
import { SpecialServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/SpecialServiceCategory";
import { toApiServiceActivation } from "@pagopa/io-functions-commons/dist/src/utils/activations";
import { FiscalCodePayloadMiddleware } from "../utils/profile";
import { initTelemetryClient } from "../utils/appinsights";
import { FiscalCodePayload } from "../generated/definitions/FiscalCodePayload";
import { Activation } from "../generated/definitions/Activation";

export type IGetActivationFailureResponses =
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseErrorInternal
  | IResponseErrorForbiddenNotAuthorized;
export type IGetActivationResponses =
  | IResponseSuccessJson<Activation>
  | IGetActivationFailureResponses;

/**
 * Type of a GetLimitedProfileByPOST handler.
 *
 * GetLimitedProfileByPOST expects a FiscalCode as input (in the body) and returns a LimitedProfile or a NotFound error.
 */
type IGetActivationByPOSTHandler = (
  apiAuthorization: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  payload: FiscalCodePayload
) => Promise<IGetActivationResponses>;

/**
 * Returns a type safe GetLimitedProfileByPOST handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetServiceActivationHandler(
  activationModel: ActivationModel,
  _1: ReturnType<typeof initTelemetryClient>
): IGetActivationByPOSTHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (_auth, __, userAttributes, { fiscal_code }) =>
    pipe(
      O.fromNullable(userAttributes.service.serviceMetadata),
      O.filter(
        serviceMetadata =>
          serviceMetadata.category === SpecialServiceCategoryEnum.SPECIAL
      ),
      TE.fromOption(() => ResponseErrorForbiddenNotAuthorized),
      TE.chainW(_ =>
        pipe(
          activationModel.findLastVersionByModelId([
            userAttributes.service.serviceId,
            fiscal_code
          ]),
          TE.mapLeft(error =>
            ResponseErrorQuery("Error reading service Activation", error)
          )
        )
      ),
      TE.chainW(
        flow(
          TE.fromOption(() =>
            ResponseErrorNotFound(
              "Not Found",
              "Activation not found for the user"
            )
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
// eslint-disable-next-line max-params,prefer-arrow/prefer-arrow-functions
export function GetServiceActivation(
  serviceModel: ServiceModel,
  activationModel: ActivationModel,
  telemetryClient: ReturnType<typeof initTelemetryClient>
): express.RequestHandler {
  const handler = GetServiceActivationHandler(activationModel, telemetryClient);

  const middlewaresWrap = withRequestMiddlewares(
    AzureApiAuthMiddleware(new Set([UserGroup.ApiMessageWrite])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    FiscalCodePayloadMiddleware
  );

  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, c, u, __) => ipTuple(c, u))
    )
  );
}
