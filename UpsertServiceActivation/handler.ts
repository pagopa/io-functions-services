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
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import { toApiServiceActivation } from "@pagopa/io-functions-commons/dist/src/utils/activations";
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { Context } from "@azure/functions";
import { flow } from "fp-ts/lib/function";
import { Activation } from "../generated/definitions/Activation";
import { ActivationPayload } from "../generated/definitions/ActivationPayload";
import { ServiceId } from "../generated/definitions/ServiceId";
import { authorizedForSpecialServicesTask } from "../utils/services";
import { getLogger } from "../utils/logging";

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
  context: Context,
  apiAuthorization: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  payload: Activation
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
 * Returns a type safe GetActivationByPOST handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpsertServiceActivationHandler(
  activationModel: ActivationModel
): IUpsertActivationByPOSTHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _auth, __, userAttributes, newActivation) => {
    const logPrefix = `${context.executionContext.functionName}|SERVICE_ID=${userAttributes.service.serviceId}`;
    const logger = getLogger(
      context,
      logPrefix,
      "UpsertServiceActivationHandler"
    );
    return pipe(
      authorizedForSpecialServicesTask(userAttributes.service),
      TE.chainW(_ =>
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

/**
 * Wraps a GetServiceActivation handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
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
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}
