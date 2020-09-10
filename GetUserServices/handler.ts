import * as express from "express";

import {
  ClientIp,
  ClientIpMiddleware
} from "io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";

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
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { EmailString, NonEmptyString } from "italia-ts-commons/lib/strings";

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
import { ServiceId } from "io-functions-commons/dist/generated/definitions/ServiceId";
import { ServiceModel } from "io-functions-commons/dist/src/models/service";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { UserInfo } from "../generated/api-admin/UserInfo";
import { ServiceIdCollection } from "../generated/definitions/ServiceIdCollection";
import { APIClient } from "../utils/clients/admin";
import { ErrorResponses, toErrorServerResponse } from "../utils/responses";

/**
 * Type of a GetUserServices handler.
 *
 * GetUserServices returns a list of ServiceId as output or unauthorized or too many requests
 * errors.
 */
type IGetUserServicesHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes
) => Promise<IResponseSuccessJson<ServiceIdCollection> | ErrorResponses>;

const getUserServicesTask = (
  apiClient: ReturnType<APIClient>,
  userEmail: EmailString
): TaskEither<ErrorResponses, UserInfo> =>
  tryCatch(
    () =>
      apiClient.getUser({
        email: userEmail
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
 * Handles requests for getting an array of serviceID by providing the current user email.
 */
export function GetServiceHandler(
  apiClient: ReturnType<APIClient>
): IGetUserServicesHandler {
  return (_, __, ___, userAttributes) => {
    return getUserServicesTask(apiClient, userAttributes.email)
      .map(userInfo =>
        ResponseSuccessJson({
          items: userInfo.subscriptions.map(it =>
            ServiceId.encode(it.id as NonEmptyString)
          )
        })
      )
      .fold<IResponseSuccessJson<ServiceIdCollection> | ErrorResponses>(
        identity,
        identity
      )
      .run();
  };
}

/**
 * Wraps a GetUserServices handler inside an Express request handler.
 */
export function GetUserServices(
  serviceModel: ServiceModel,
  client: ReturnType<APIClient>
): express.RequestHandler {
  const handler = GetServiceHandler(client);
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceRead])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel)
  );
  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u) => ipTuple(c, u))
    )
  );
}
