import { Context } from "@azure/functions";
import { ActivationModel } from "@pagopa/io-functions-commons/dist/src/models/activation";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { toApiServiceActivation } from "@pagopa/io-functions-commons/dist/src/utils/activations";
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
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import express from "express";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import { Activation } from "../generated/definitions/Activation";
import { FiscalCodePayload } from "../generated/definitions/FiscalCodePayload";
import { getLogger } from "../utils/logging";
import { FiscalCodePayloadMiddleware } from "../utils/profile";
import { authorizedForSpecialServicesTask } from "../utils/services";

export type IGetActivationFailureResponses =
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorQuery;
export type IGetActivationResponses =
  | IGetActivationFailureResponses
  | IResponseSuccessJson<Activation>;

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
 * Wraps a GetServiceActivation handler inside an Express request handler.
 */
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}

/**
 * Returns a type safe GetActivationByPOST handler.
 */
export function GetServiceActivationHandler(
  activationModel: ActivationModel
): IGetActivationByPOSTHandler {
  return async (context, _auth, __, userAttributes, { fiscal_code }) => {
    const logPrefix = `${context.executionContext.functionName}|SERVICE_ID=${userAttributes.service.serviceId}`;
    const logger = getLogger(context, logPrefix, "GetServiceActivationHandler");
    return pipe(
      authorizedForSpecialServicesTask(userAttributes.service),
      TE.chainW(() =>
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
