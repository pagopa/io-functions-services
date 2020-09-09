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
import { Logo } from "../generated/api-admin/Logo";
import { APIClient } from "../utils/clients/admin";
import { LogoPayloadMiddleware } from "../utils/middlewares/service";
import {
  ErrorResponses,
  IResponseErrorUnauthorized,
  toErrorServerResponse
} from "../utils/responses";

type ResponseTypes =
  | IResponseSuccessJson<undefined>
  | IResponseErrorUnauthorized
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorNotFound
  | IResponseErrorTooManyRequests
  | IResponseErrorInternal;

/**
 * Type of a GetUploadServiceLogoHandler handler.
 *
 * GetUploadServiceLogo expects a service ID and a logo as input
 * and returns informations about upload outcome
 */
type IGetUploadServiceLogoHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes,
  serviceId: string,
  logoPayload: Logo
) => Promise<ResponseTypes>;

const uploadServiceLogoTask = (
  apiClient: ReturnType<APIClient>,
  serviceId: string,
  logo: Logo
): TaskEither<ErrorResponses, IResponseSuccessJson<undefined>> =>
  tryCatch(
    () =>
      apiClient.uploadServiceLogo({
        logo,
        service_id: serviceId
      }),
    errs => ResponseErrorInternal(JSON.stringify(errs))
  ).foldTaskEither(
    err => fromLeft(err),
    maybeResponse =>
      maybeResponse.fold(
        errs => fromLeft(ResponseErrorInternal(JSON.stringify(errs))),
        responseType =>
          responseType.status !== 201
            ? fromLeft(toErrorServerResponse(responseType))
            : taskEither.of(ResponseSuccessJson(responseType.value))
      )
  );

/**
 * Handles requests for upload a service logo by a service ID and a base64 logo' s string.
 */
export function GetUploadServiceLogoHandler(
  apiClient: ReturnType<APIClient>
): IGetUploadServiceLogoHandler {
  return (_, __, ___, ____, serviceId, logoPayload) => {
    return uploadServiceLogoTask(apiClient, serviceId, logoPayload)
      .fold<ResponseTypes>(identity, identity)
      .run();
  };
}

/**
 * Wraps a GetUploadServiceLogo handler inside an Express request handler.
 */
export function GetUploadServiceLogo(
  serviceModel: ServiceModel,
  client: ReturnType<APIClient>
): express.RequestHandler {
  const handler = GetUploadServiceLogoHandler(client);
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    RequiredParamMiddleware("service_id", NonEmptyString),
    LogoPayloadMiddleware
  );
  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___, ____) =>
        ipTuple(c, u)
      )
    )
  );
}
