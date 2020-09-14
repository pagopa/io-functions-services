import * as express from "express";

import {
  ClientIp,
  ClientIpMiddleware
} from "io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";

import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";

import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import {
  AzureUserAttributesMiddleware,
  IAzureUserAttributes
} from "io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorTooManyRequests,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "io-functions-commons/dist/src/utils/source_ip_check";

import { Context } from "@azure/functions";
import { identity } from "fp-ts/lib/function";
import {
  fromLeft,
  taskEither,
  TaskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import { ServiceModel } from "io-functions-commons/dist/src/models/service";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { SubscriptionKeys } from "../generated/definitions/SubscriptionKeys";
import { SubscriptionKeyTypePayload } from "../generated/definitions/SubscriptionKeyTypePayload";
import { APIClient } from "../utils/clients/admin";
import {
  ErrorResponses,
  IResponseErrorUnauthorized,
  toErrorServerResponse
} from "../utils/responses";
import { serviceOwnerCheck } from "../utils/subscription";

type ResponseTypes =
  | IResponseSuccessJson<SubscriptionKeys>
  | IResponseErrorUnauthorized
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorNotFound
  | IResponseErrorTooManyRequests
  | IResponseErrorInternal;

/**
 * Type of a GetRegenerateServiceKeyHandler handler.
 *
 * RegenerateServiceKey expects a service ID and a subscriptionKeyType as input
 * and returns regenerated subscriptionkeys as outcome
 */
type IRegenerateServiceKeyHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes,
  serviceId: NonEmptyString,
  subscriptionKeyTypePayload: SubscriptionKeyTypePayload
) => Promise<ResponseTypes>;

const regenerateServiceKeyTask = (
  apiClient: ReturnType<APIClient>,
  serviceId: NonEmptyString,
  subscriptionKeyTypePayload: SubscriptionKeyTypePayload
): TaskEither<ErrorResponses, IResponseSuccessJson<SubscriptionKeys>> =>
  tryCatch(
    () =>
      apiClient.RegenerateSubscriptionKeys({
        service_id: serviceId,
        subscriptionKeyTypePayload
      }),
    errs => ResponseErrorInternal(JSON.stringify(errs))
  ).foldTaskEither(
    err => fromLeft(err),
    errorOrResponse =>
      errorOrResponse.fold(
        errs => fromLeft(ResponseErrorInternal(JSON.stringify(errs))),
        responseType =>
          responseType.status !== 200
            ? fromLeft(toErrorServerResponse(responseType))
            : taskEither.of(ResponseSuccessJson(responseType.value))
      )
  );

/**
 * Handles requests for upload a service logo by a service ID and a base64 logo' s string.
 */
export function RegenerateServiceKeyHandler(
  apiClient: ReturnType<APIClient>
): IRegenerateServiceKeyHandler {
  return (_, apiAuth, ___, ____, serviceId, subscriptionKeyTypePayload) => {
    return serviceOwnerCheck(
      serviceId,
      apiAuth.subscriptionId,
      "You are not allowed to regenerate keys for this service"
    )
      .chain(() =>
        regenerateServiceKeyTask(
          apiClient,
          serviceId,
          subscriptionKeyTypePayload
        )
      )
      .fold<ResponseTypes>(identity, identity)
      .run();
  };
}

/**
 * Wraps a RegenerateServiceKey handler inside an Express request handler.
 */
export function RegenerateServiceKey(
  serviceModel: ServiceModel,
  client: ReturnType<APIClient>
): express.RequestHandler {
  const handler = RegenerateServiceKeyHandler(client);
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    RequiredParamMiddleware("service_id", NonEmptyString),
    RequiredBodyPayloadMiddleware(SubscriptionKeyTypePayload)
  );
  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___, ____) =>
        ipTuple(c, u)
      )
    )
  );
}
