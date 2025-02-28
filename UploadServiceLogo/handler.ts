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
  ResponseErrorForbiddenNotAuthorized,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";

import { Context } from "@azure/functions";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { pipe } from "fp-ts/lib/function";
import { TaskEither } from "fp-ts/lib/TaskEither";
import * as TE from "fp-ts/lib/TaskEither";
import { SequenceMiddleware } from "@pagopa/ts-commons/lib/sequence_middleware";
import {
  AzureUserAttributesManageMiddleware,
  IAzureUserAttributesManage
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes_manage";
import { SubscriptionCIDRsModel } from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
import { APIClient } from "../clients/admin";
import { withApiRequestWrapper } from "../utils/api";
import { getLogger, ILogger } from "../utils/logging";
import { ErrorResponses, IResponseErrorUnauthorized } from "../utils/responses";
import {
  serviceOwnerCheckManageTask,
  serviceOwnerCheckTask
} from "../utils/subscription";
import { Logo } from "../generated/definitions/Logo";

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
  attrs: IAzureUserAttributes | IAzureUserAttributesManage,
  serviceId: NonEmptyString,
  logoPayload: Logo
) => Promise<ResponseTypes>;

const uploadServiceLogoTask = (
  logger: ILogger,
  apiClient: APIClient,
  serviceId: string,
  logo: Logo
): TaskEither<ErrorResponses, IResponseSuccessJson<undefined>> =>
  pipe(
    withApiRequestWrapper(
      logger,
      () =>
        apiClient.uploadServiceLogo({
          body: logo,
          service_id: serviceId
        }),
      201
    ),
    TE.map(_ => ResponseSuccessJson(undefined))
  );

/**
 * Handles requests for upload a service logo by a service ID and a base64 logo' s string.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UploadServiceLogoHandler(
  apiClient: APIClient
): IUploadServiceLogoHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, max-params
  return (_, apiAuth, ___, ____, serviceId, logoPayload) =>
    pipe(
      serviceOwnerCheckTask(serviceId, apiAuth.subscriptionId),
      TE.fold(
        __ =>
          serviceOwnerCheckManageTask(
            getLogger(_, logPrefix, "GetSubscription"),
            apiClient,
            serviceId,
            apiAuth.subscriptionId,
            apiAuth.userId
          ),
        sid => TE.of(sid)
      ),
      TE.chain(() =>
        uploadServiceLogoTask(
          getLogger(_, logPrefix, "UploadServiceLogo"),
          apiClient,
          serviceId,
          logoPayload
        )
      ),
      TE.toUnion
    )();
}

/**
 * Wraps a UploadServiceLogo handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UploadServiceLogo(
  serviceModel: ServiceModel,
  client: APIClient,
  subscriptionCIDRsModel: SubscriptionCIDRsModel
): express.RequestHandler {
  const handler = UploadServiceLogoHandler(client);
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    ClientIpMiddleware,
    SequenceMiddleware(ResponseErrorForbiddenNotAuthorized)(
      AzureUserAttributesMiddleware(serviceModel),
      AzureUserAttributesManageMiddleware(subscriptionCIDRsModel)
    ),
    RequiredParamMiddleware("service_id", NonEmptyString),
    RequiredBodyPayloadMiddleware(Logo)
  );
  return wrapRequestHandler(
    middlewaresWrap(
      // eslint-disable-next-line max-params
      checkSourceIpForHandler(handler, (_, __, c, u, ___, ____) =>
        ipTuple(c, u)
      )
    )
  );
}
