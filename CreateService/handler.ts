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
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorTooManyRequests,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";

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
import {
  ObjectIdGenerator,
  ulidGenerator
} from "io-functions-commons/dist/src/utils/strings";
import { EmailString, NonEmptyString } from "italia-ts-commons/lib/strings";
import { Service } from "../generated/api-admin/Service";
import { Subscription } from "../generated/api-admin/Subscription";
import { ServicePayload } from "../generated/definitions/ServicePayload";
import { ServiceWithSubscriptionKeys } from "../generated/definitions/ServiceWithSubscriptionKeys";
import { APIClient } from "../utils/clients/admin";
import {
  ErrorResponses,
  IResponseErrorUnauthorized,
  toErrorServerResponse
} from "../utils/responses";

type ResponseTypes =
  | IResponseSuccessJson<ServiceWithSubscriptionKeys>
  | IResponseErrorUnauthorized
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorNotFound
  | IResponseErrorTooManyRequests
  | IResponseErrorInternal;

const productName = "IO-SERVICES-API" as NonEmptyString;

/**
 * Type of a GetCreateService handler.
 *
 * GetCreateService expects a service payload as input
 * and returns service with subscription keys
 */
type IGetCreateServiceHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes,
  servicePayload: ServicePayload
) => Promise<ResponseTypes>;

const createSubscriptionTask = (
  apiClient: ReturnType<APIClient>,
  userEmail: EmailString,
  subscriptionId: NonEmptyString
): TaskEither<ErrorResponses, Subscription> =>
  tryCatch(
    () =>
      apiClient.createSubscription({
        email: userEmail,
        productNamePayload: {
          product_name: productName
        },
        subscription_id: subscriptionId
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
const createServiceTask = (
  apiClient: ReturnType<APIClient>,
  servicePayload: ServicePayload,
  subscriptionId: NonEmptyString
): TaskEither<ErrorResponses, Service> =>
  tryCatch(
    () =>
      apiClient.createService({
        service: {
          ...servicePayload,
          authorized_recipients: [],
          service_id: subscriptionId
        }
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
 * Handles requests for create a service by a Service Payload.
 */
export function GetCreateServiceHandler(
  apiClient: ReturnType<APIClient>,
  generateObjectId: ObjectIdGenerator
): IGetCreateServiceHandler {
  return (_, __, ___, userAttributes, servicePayload) => {
    const subscriptionId = generateObjectId();
    return createSubscriptionTask(
      apiClient,
      userAttributes.email,
      subscriptionId
    )
      .chain(subscription =>
        createServiceTask(apiClient, servicePayload, subscriptionId).map(
          service =>
            ResponseSuccessJson({
              ...service,
              primary_key: subscription.primary_key,
              secondary_key: subscription.secondary_key
            })
        )
      )
      .fold<ResponseTypes>(identity, identity)
      .run();
  };
}

/**
 * Wraps a GetCreateService handler inside an Express request handler.
 */
export function GetCreateService(
  serviceModel: ServiceModel,
  client: ReturnType<APIClient>
): express.RequestHandler {
  const handler = GetCreateServiceHandler(client, ulidGenerator);
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    RequiredBodyPayloadMiddleware(ServicePayload)
  );
  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}
