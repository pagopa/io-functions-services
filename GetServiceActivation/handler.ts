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
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import { toApiServiceActivation } from "@pagopa/io-functions-commons/dist/src/utils/activations";
import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { FiscalCodePayloadMiddleware } from "../utils/profile";
import { FiscalCodePayload } from "../generated/definitions/FiscalCodePayload";
import { Activation } from "../generated/definitions/Activation";
import { authorizedForSpecialServicesTask } from "../utils/services";
import { getLogger } from "../utils/logging";

export type IGetActivationFailureResponses =
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseErrorInternal
  | IResponseErrorForbiddenNotAuthorized;
export type IGetActivationResponses =
  | IResponseSuccessJson<Activation>
  | IGetActivationFailureResponses;

/**
 * Type of a IGetActivationByPOST handler.
 *
 * GetServiceActivation expects a FiscalCode as input (in the body) and returns an Activation or a NotFound error.
 */
type IGetActivationByPOSTHandler = (
  context: Context,
  apiAuthorization: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  payload: FiscalCodePayload
) => Promise<IGetActivationResponses>;

/**
 * Returns a type safe GetActivationByPOST handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetServiceActivationHandler(
  activationModel: ActivationModel
): IGetActivationByPOSTHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _auth, __, userAttributes, { fiscal_code }) => {
    const logPrefix = `${context.executionContext.functionName}|SERVICE_ID=${userAttributes.service.serviceId}`;
    const logger = getLogger(context, logPrefix, "GetServiceActivationHandler");
    return pipe(
      authorizedForSpecialServicesTask(userAttributes.service),
      TE.chainW(_ =>
        pipe(
          activationModel.findLastVersionByModelId([
            userAttributes.service.serviceId,
            fiscal_code
          ]),
          TE.mapLeft(error => {
            logger.logCosmosErrors(error);
            return ResponseErrorQuery(
              "Error reading service Activation",
              error
            );
          }),
          TE.chainW(
            TE.fromOption(() =>
              ResponseErrorNotFound(
                "Not Found",
                "Activation not found for the user"
              )
            )
          )
        )
      ),
      TE.map(flow(toApiServiceActivation, ResponseSuccessJson)),
      TE.toUnion
    )();
  };
}

/**
 * Wraps a GetServiceActivation handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetServiceActivation(
  serviceModel: ServiceModel,
  activationModel: ActivationModel
): express.RequestHandler {
  const handler = GetServiceActivationHandler(activationModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiMessageWrite])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    FiscalCodePayloadMiddleware
  );

  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}
