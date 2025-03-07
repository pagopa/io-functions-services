import { Context } from "@azure/functions";
import { Service } from "@pagopa/io-functions-admin-sdk/Service";
import { SubscriptionKeys } from "@pagopa/io-functions-admin-sdk/SubscriptionKeys";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
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
  ClientIp,
  ClientIpMiddleware
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
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
  IResponseSuccessJson,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as express from "express";
import { TaskEither } from "fp-ts/lib/TaskEither";
import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";

import { APIClient } from "../clients/admin";
import { ServiceWithSubscriptionKeys } from "../generated/definitions/ServiceWithSubscriptionKeys";
import { withApiRequestWrapper } from "../utils/api";
import { ILogger, getLogger } from "../utils/logging";
import { ErrorResponses } from "../utils/responses";
import { serviceOwnerCheckTask } from "../utils/subscription";

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
  serviceId: NonEmptyString
) => Promise<
  IResponseSuccessJson<ServiceWithSubscriptionKeys> | ErrorResponses
>;

const logPrefix = "GetServiceHandler";

const getServiceTask = (
  logger: ILogger,
  apiClient: APIClient,
  serviceId: string
): TaskEither<ErrorResponses, Service> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.getService({
        service_id: serviceId
      }),
    200
  );

const getSubscriptionKeysTask = (
  logger: ILogger,
  apiClient: APIClient,
  serviceId: string
): TaskEither<ErrorResponses, SubscriptionKeys> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.getSubscriptionKeys({
        service_id: serviceId
      }),
    200
  );

/**
 * Handles requests for getting a single service by a service ID.
 */
export function GetServiceHandler(apiClient: APIClient): IGetServiceHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return (_, apiAuth, ___, ____, serviceId) =>
    pipe(
      serviceOwnerCheckTask(serviceId, apiAuth.subscriptionId),
      TE.chain(() =>
        pipe(
          getServiceTask(
            getLogger(_, logPrefix, "GetService"),
            apiClient,
            serviceId
          ),
          TE.chain((service) =>
            pipe(
              getSubscriptionKeysTask(
                getLogger(_, logPrefix, "GetSubscriptionKeys"),
                apiClient,
                serviceId
              ),
              TE.map((subscriptionKeys) =>
                ResponseSuccessJson({
                  ...service,
                  ...subscriptionKeys
                })
              )
            )
          )
        )
      ),
      TE.toUnion
    )();
}

/**
 * Wraps a GetService handler inside an Express request handler.
 */
export function GetService(
  serviceModel: ServiceModel,
  client: APIClient
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}
