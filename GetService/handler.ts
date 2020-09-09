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
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseErrorNotFound,
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
import { IResponseType } from "italia-ts-commons/lib/requests";
import { Service } from "../generated/api-admin/Service";
import { SubscriptionKeys } from "../generated/api-admin/SubscriptionKeys";
import { ServiceWithSubscriptionKeys } from "../generated/definitions/ServiceWithSubscriptionKeys";
import { APIClient } from "../utils/clients/admin";
import {
  IResponseErrorUnauthorized,
  ResponseErrorUnauthorized,
  unhandledResponseStatus
} from "../utils/responses";

/**
 * Type of a GetService handler.
 *
 * GetService expects a service ID as input
 * and returns a Service as output or a Not Found or Validation
 * errors.
 */
type IGetServiceHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes,
  serviceId: string
) => Promise<
  IResponseSuccessJson<ServiceWithSubscriptionKeys> | ErrorResponses
>;

const toErrorServerResponse = <S extends number, T>(
  response: IResponseType<S, T>
) => {
  if (response.status === 401) {
    return ResponseErrorUnauthorized("Unauthorized", "Unauthorized");
  }

  if (response.status === 403) {
    return ResponseErrorForbiddenNotAuthorized;
  }

  if (response.status === 404) {
    return ResponseErrorNotFound("Not found", "Resource not found");
  }

  return unhandledResponseStatus(response.status);
};

type ErrorResponses =
  | IResponseErrorNotFound
  | IResponseErrorUnauthorized
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal;

const getServiceTask = (
  apiClient: ReturnType<APIClient>,
  serviceId: string
): TaskEither<ErrorResponses, Service> =>
  tryCatch(
    () =>
      apiClient.getService({
        service_id: serviceId
      }),
    errs => ResponseErrorInternal(JSON.stringify(errs))
  ).foldTaskEither(
    err => fromLeft(err),
    maybeResponse =>
      maybeResponse.fold(
        errs => fromLeft(ResponseErrorInternal(JSON.stringify(errs))),
        responseType =>
          responseType.status !== 200
            ? fromLeft(toErrorServerResponse(responseType))
            : taskEither.of(responseType.value)
      )
  );

const getSubscriptionKeysTask = (
  apiClient: ReturnType<APIClient>,
  serviceId: string
): TaskEither<ErrorResponses, SubscriptionKeys> =>
  tryCatch(
    () =>
      apiClient.getSubscriptionKeys({
        service_id: serviceId
      }),
    errs => ResponseErrorInternal(JSON.stringify(errs))
  ).foldTaskEither(
    err => fromLeft(err),
    maybeResponse =>
      maybeResponse.fold(
        errs => fromLeft(ResponseErrorInternal(JSON.stringify(errs))),
        responseType =>
          responseType.status !== 200
            ? fromLeft(toErrorServerResponse(responseType))
            : taskEither.of(responseType.value)
      )
  );

/**
 * Handles requests for getting a single service by a service ID.
 */
export function GetServiceHandler(
  apiClient: ReturnType<APIClient>
): IGetServiceHandler {
  return (_, __, ___, ____, serviceId) => {
    return getServiceTask(apiClient, serviceId)
      .chain(service =>
        getSubscriptionKeysTask(apiClient, serviceId).map(subscriptionKeys =>
          ResponseSuccessJson({
            ...service,
            ...subscriptionKeys
          })
        )
      )
      .fold<IResponseSuccessJson<ServiceWithSubscriptionKeys> | ErrorResponses>(
        identity,
        identity
      )
      .run();
  };
}

/**
 * Wraps a GetService handler inside an Express request handler.
 */
export function GetService(
  serviceModel: ServiceModel,
  client: ReturnType<APIClient>
): express.RequestHandler {
  const handler = GetServiceHandler(client);
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceRead])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    RequiredParamMiddleware("service_id", NonEmptyString)
  );
  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}
