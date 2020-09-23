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
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "io-functions-commons/dist/src/utils/source_ip_check";

import { Context } from "@azure/functions";
import { identity } from "fp-ts/lib/function";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { ServiceModel } from "io-functions-commons/dist/src/models/service";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { APIClient } from "../clients/admin";
import { SubscriptionKeys } from "../generated/definitions/SubscriptionKeys";
import { SubscriptionKeyTypePayload } from "../generated/definitions/SubscriptionKeyTypePayload";
import { withApiRequestWrapper } from "../utils/api";
import { getLogger, ILogger } from "../utils/logging";
import { ErrorResponses, IResponseErrorUnauthorized } from "../utils/responses";
import { serviceOwnerCheckTask } from "../utils/subscription";

type ResponseTypes =
  | IResponseSuccessJson<SubscriptionKeys>
  | IResponseErrorUnauthorized
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorNotFound
  | IResponseErrorTooManyRequests
  | IResponseErrorInternal;

const logPrefix = "RegenerateServiceKeyHandler";

/**
 * Type of a RegenerateServiceKeyHandler handler.
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
  logger: ILogger,
  apiClient: APIClient,
  serviceId: NonEmptyString,
  subscriptionKeyTypePayload: SubscriptionKeyTypePayload
): TaskEither<ErrorResponses, IResponseSuccessJson<SubscriptionKeys>> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.RegenerateSubscriptionKeys({
        body: subscriptionKeyTypePayload,
        service_id: serviceId
      }),
    200
  ).map(ResponseSuccessJson);

/**
 * Handles requests for upload a service logo by a service ID and a base64 logo' s string.
 */
export function RegenerateServiceKeyHandler(
  apiClient: APIClient
): IRegenerateServiceKeyHandler {
  return (_, apiAuth, ___, ____, serviceId, subscriptionKeyTypePayload) => {
    return serviceOwnerCheckTask(serviceId, apiAuth.subscriptionId)
      .chain(() =>
        regenerateServiceKeyTask(
          getLogger(_, logPrefix, "RegenerateServiceKey"),
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
  client: APIClient
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
