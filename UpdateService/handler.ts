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
import { RequiredBodyPayloadMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_body_payload";
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
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { Service } from "../generated/api-admin/Service";
import { SubscriptionKeys } from "../generated/api-admin/SubscriptionKeys";
import { ServicePayload } from "../generated/definitions/ServicePayload";
import { ServiceWithSubscriptionKeys } from "../generated/definitions/ServiceWithSubscriptionKeys";
import { APIClient } from "../utils/clients/admin";
import { getLogger, ILogger } from "../utils/logging";
import {
  ErrorResponses,
  IResponseErrorUnauthorized,
  toDefaultResponseErrorInternal,
  toErrorServerResponse
} from "../utils/responses";
import { serviceOwnerCheckTask } from "../utils/subscription";

type ResponseTypes =
  | IResponseSuccessJson<ServiceWithSubscriptionKeys>
  | IResponseErrorUnauthorized
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorNotFound
  | IResponseErrorTooManyRequests
  | IResponseErrorInternal;

/**
 * Type of a UpdateService handler.
 *
 * UpdateService expects a service_id and a service payload as input
 * and returns updated service with subscription keys
 */
type IUpdateServiceHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes,
  serviceId: NonEmptyString,
  servicePayload: ServicePayload
) => Promise<ResponseTypes>;

const logPrefix = "UpdateServiceHandler";

const getSubscriptionKeysTask = (
  logger: ILogger,
  apiClient: ReturnType<APIClient>,
  serviceId: NonEmptyString
): TaskEither<ErrorResponses, SubscriptionKeys> =>
  tryCatch(
    () =>
      apiClient.getSubscriptionKeys({
        service_id: serviceId
      }),
    errs => {
      logger.logUnknown(errs);
      return toDefaultResponseErrorInternal(errs);
    }
  ).foldTaskEither(
    err => fromLeft(err),
    errorOrResponse =>
      errorOrResponse.fold(
        errs => {
          logger.logErrors(errs);
          return fromLeft(toDefaultResponseErrorInternal(errs));
        },
        responseType =>
          responseType.status !== 200
            ? fromLeft(toErrorServerResponse(responseType))
            : taskEither.of(responseType.value)
      )
  );

const getServiceTask = (
  logger: ILogger,
  apiClient: ReturnType<APIClient>,
  serviceId: NonEmptyString
): TaskEither<ErrorResponses, Service> =>
  tryCatch(
    () =>
      apiClient.getService({
        service_id: serviceId
      }),
    errs => {
      logger.logUnknown(errs);
      return toDefaultResponseErrorInternal(errs);
    }
  ).foldTaskEither(
    err => fromLeft(err),
    errorOrResponse =>
      errorOrResponse.fold(
        errs => {
          logger.logErrors(errs);
          return fromLeft(toDefaultResponseErrorInternal(errs));
        },
        responseType =>
          responseType.status !== 200
            ? fromLeft(toErrorServerResponse(responseType))
            : taskEither.of(responseType.value)
      )
  );

const updateServiceTask = (
  logger: ILogger,
  apiClient: ReturnType<APIClient>,
  servicePayload: ServicePayload,
  serviceId: NonEmptyString,
  retrievedService: Service
): TaskEither<ErrorResponses, Service> =>
  tryCatch(
    () =>
      apiClient.updateService({
        service: {
          ...retrievedService,
          ...servicePayload,
          service_id: serviceId
        },
        service_id: serviceId
      }),
    errs => {
      logger.logUnknown(errs);
      return toDefaultResponseErrorInternal(errs);
    }
  ).foldTaskEither(
    err => fromLeft(err),
    errorOrResponse =>
      errorOrResponse.fold(
        errs => {
          logger.logErrors(errs);
          return fromLeft(toDefaultResponseErrorInternal(errs));
        },
        responseType =>
          responseType.status !== 200
            ? fromLeft(toErrorServerResponse(responseType))
            : taskEither.of(responseType.value)
      )
  );

/**
 * Handles requests for updating a service by given serviceId and a Service Payload.
 */
export function UpdateServiceHandler(
  apiClient: ReturnType<APIClient>
): IUpdateServiceHandler {
  return (_, apiAuth, ___, ____, serviceId, servicePayload) => {
    return serviceOwnerCheckTask(serviceId, apiAuth.subscriptionId)
      .chain(() =>
        getServiceTask(
          getLogger(_, logPrefix, "GetService"),
          apiClient,
          serviceId
        ).chain(retrievedService =>
          updateServiceTask(
            getLogger(_, logPrefix, "UpdateService"),
            apiClient,
            servicePayload,
            serviceId,
            retrievedService
          ).chain(service =>
            getSubscriptionKeysTask(
              getLogger(_, logPrefix, "GetSubscriptionKeys"),
              apiClient,
              serviceId
            ).map(subscriptionKeys =>
              ResponseSuccessJson({
                ...service,
                ...subscriptionKeys
              })
            )
          )
        )
      )
      .fold<ResponseTypes>(identity, identity)
      .run();
  };
}

/**
 * Wraps a UpdateService handler inside an Express request handler.
 */
export function UpdateService(
  serviceModel: ServiceModel,
  client: ReturnType<APIClient>
): express.RequestHandler {
  const handler = UpdateServiceHandler(client);
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    RequiredParamMiddleware("service_id", NonEmptyString),
    RequiredBodyPayloadMiddleware(ServicePayload)
  );
  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___, ____) =>
        ipTuple(c, u)
      )
    )
  );
}
