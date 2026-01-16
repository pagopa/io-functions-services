import { Context } from "@azure/functions";
import {
  ActivationModel,
  NewActivation
} from "@pagopa/io-functions-commons/dist/src/models/activation";
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
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
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
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import express from "express";
import { pipe } from "fp-ts/lib/function";
import { flow } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import { Activation } from "../generated/definitions/Activation";
import { ActivationPayload } from "../generated/definitions/ActivationPayload";
import { ServiceId } from "../generated/definitions/ServiceId";
import { getLogger } from "../utils/logging";
import { authorizedForSpecialServicesTask } from "../utils/services";

export type IUpertActivationFailureResponses =
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorQuery;
export type IUpsertActivationResponses =
  | IResponseSuccessJson<Activation>
  | IUpertActivationFailureResponses;

/**
 * Type of a IGetActivationByPOST handler.
 *
 * GetServiceActivation expects a FiscalCode as input (in the body) and returns an Activation or a NotFound error.
 */
type IUpsertActivationByPOSTHandler = (
  context: Context,
  apiAuthorization: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  payload: ActivationPayload
) => Promise<IUpsertActivationResponses>;

const toModelServiceActivation = (
  apiActivation: ActivationPayload,
  serviceId: ServiceId
): NewActivation => ({
  fiscalCode: apiActivation.fiscal_code,
  kind: "INewActivation",
  serviceId,
  status: apiActivation.status
});

/**
 * Wraps a GetServiceActivation handler inside an Express request handler.
 */
export function UpsertServiceActivation(
  serviceModel: ServiceModel,
  activationModel: ActivationModel
): express.RequestHandler {
  const handler = UpsertServiceActivationHandler(activationModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiMessageWrite])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    RequiredBodyPayloadMiddleware(ActivationPayload)
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
export function UpsertServiceActivationHandler(
  activationModel: ActivationModel
): IUpsertActivationByPOSTHandler {
  return async (context, _auth, __, userAttributes, newActivation) => {
    const logPrefix = `${context.executionContext.functionName}|SERVICE_ID=${userAttributes.service.serviceId}`;
    const logger = getLogger(
      context,
      logPrefix,
      "UpsertServiceActivationHandler"
    );
    return pipe(
      authorizedForSpecialServicesTask(userAttributes.service),
      TE.chainW(() =>
        pipe(
          activationModel.upsert(
            toModelServiceActivation(
              newActivation,
              userAttributes.service.serviceId
            )
          ),
          TE.mapLeft(error => {
            logger.logCosmosErrors(error);
            return ResponseErrorQuery(
              "Error upserting service Activation",
              error
            );
          })
        )
      ),
      TE.map(flow(toApiServiceActivation, ResponseSuccessJson)),
      TE.toUnion
    )();
  };
}
