import { Context } from "@azure/functions";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { SubscriptionCIDRsModel } from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
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
  AzureUserAttributesManageMiddleware,
  IAzureUserAttributesManage
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes_manage";
import {
  ClientIp,
  ClientIpMiddleware
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorTooManyRequests,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorized,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { SequenceMiddleware } from "@pagopa/ts-commons/lib/sequence_middleware";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as express from "express";
import { TaskEither } from "fp-ts/lib/TaskEither";
import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";
import * as t from "io-ts";

import { APIClient } from "../clients/admin";
import { Logo } from "../generated/definitions/Logo";
import { withApiRequestWrapper } from "../utils/api";
import { ILogger, getLogger } from "../utils/logging";
import { ErrorResponses, IResponseErrorUnauthorized } from "../utils/responses";
import {
  serviceOwnerCheckManageTask,
  serviceOwnerCheckTask
} from "../utils/subscription";

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
    TE.map(() => ResponseSuccessJson(undefined))
  );

/**
 * Handles requests for upload a service logo by a service ID and a base64 logo' s string.
 */
export function UploadServiceLogoHandler(
  apiClient: APIClient
): IUploadServiceLogoHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, max-params
  return (_, apiAuth, ___, ____, serviceId, logoPayload) =>
    pipe(
      serviceOwnerCheckTask(serviceId, apiAuth.subscriptionId),
      TE.fold(
        () =>
          serviceOwnerCheckManageTask(
            getLogger(_, logPrefix, "GetSubscription"),
            apiClient,
            serviceId,
            apiAuth.subscriptionId,
            apiAuth.userId
          ),
        (sid) => TE.of(sid)
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
    // Added t.exact following the replacement of @pagopa/io-functions-admin-sdk/Logo with generated/definitions/Logo
    RequiredBodyPayloadMiddleware(t.exact(Logo))
  );
  return wrapRequestHandler(
    middlewaresWrap(
      // eslint-disable-next-line max-params, @typescript-eslint/no-unused-vars
      checkSourceIpForHandler(handler, (_, __, c, u, ___, ____) =>
        ipTuple(c, u)
      )
    )
  );
}
