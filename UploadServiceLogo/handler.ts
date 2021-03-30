import * as express from "express";

import {
  ClientIp,
  ClientIpMiddleware
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";

import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";

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
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorTooManyRequests,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";

import { Context } from "@azure/functions";
import { identity } from "fp-ts/lib/function";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { APIClient } from "../clients/admin";
import { Logo } from "../generated/api-admin/Logo";
import { withApiRequestWrapper } from "../utils/api";
import { getLogger, ILogger } from "../utils/logging";
import { ErrorResponses, IResponseErrorUnauthorized } from "../utils/responses";
import { serviceOwnerCheckTask } from "../utils/subscription";

type ResponseTypes =
  | IResponseSuccessJson<undefined>
  | IResponseErrorUnauthorized
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorNotFound
  | IResponseErrorTooManyRequests
  | IResponseErrorInternal;

const logPrefix = "UploadServiceLogoHandler";

/**
 * Type of a UploadServiceLogoHandler handler.
 *
 * UploadServiceLogo expects a service ID and a logo as input
 * and returns informations about upload outcome
 */
type IUploadServiceLogoHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes,
  serviceId: NonEmptyString,
  logoPayload: Logo
) => Promise<ResponseTypes>;

const uploadServiceLogoTask = (
  logger: ILogger,
  apiClient: APIClient,
  serviceId: string,
  logo: Logo
): TaskEither<ErrorResponses, IResponseSuccessJson<undefined>> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.uploadServiceLogo({
        body: logo,
        service_id: serviceId
      }),
    201
  ).map(_ => ResponseSuccessJson(undefined));

/**
 * Handles requests for upload a service logo by a service ID and a base64 logo' s string.
 */
export function UploadServiceLogoHandler(
  apiClient: APIClient
): IUploadServiceLogoHandler {
  return (_, apiAuth, ___, ____, serviceId, logoPayload) => {
    return serviceOwnerCheckTask(serviceId, apiAuth.subscriptionId)
      .chain(() =>
        uploadServiceLogoTask(
          getLogger(_, logPrefix, "UploadServiceLogo"),
          apiClient,
          serviceId,
          logoPayload
        )
      )
      .fold<ResponseTypes>(identity, identity)
      .run();
  };
}

/**
 * Wraps a UploadServiceLogo handler inside an Express request handler.
 */
export function UploadServiceLogo(
  serviceModel: ServiceModel,
  client: APIClient
): express.RequestHandler {
  const handler = UploadServiceLogoHandler(client);
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    RequiredParamMiddleware("service_id", NonEmptyString),
    RequiredBodyPayloadMiddleware(Logo)
  );
  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___, ____) =>
        ipTuple(c, u)
      )
    )
  );
}
