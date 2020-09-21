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
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";

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
import {
  ObjectIdGenerator,
  ulidGenerator
} from "io-functions-commons/dist/src/utils/strings";
import {
  EmailString,
  FiscalCode,
  NonEmptyString
} from "italia-ts-commons/lib/strings";
import { APIClient } from "../clients/admin";
import { Service } from "../generated/api-admin/Service";
import { Subscription } from "../generated/api-admin/Subscription";
import { ServicePayload } from "../generated/definitions/ServicePayload";
import { ServiceWithSubscriptionKeys } from "../generated/definitions/ServiceWithSubscriptionKeys";
import { withApiRequestWrapper } from "../utils/api";
import { getLogger, ILogger } from "../utils/logging";
import { ErrorResponses, IResponseErrorUnauthorized } from "../utils/responses";

type ResponseTypes =
  | IResponseSuccessJson<ServiceWithSubscriptionKeys>
  | IResponseErrorUnauthorized
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorNotFound
  | IResponseErrorTooManyRequests
  | IResponseErrorInternal;

const logPrefix = "CreateServiceHandler";

/**
 * Type of a CreateService handler.
 *
 * CreateService expects a service payload as input
 * and returns service with subscription keys
 */
type ICreateServiceHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes,
  servicePayload: ServicePayload
) => Promise<ResponseTypes>;

const createSubscriptionTask = (
  logger: ILogger,
  apiClient: APIClient,
  userEmail: EmailString,
  subscriptionId: NonEmptyString,
  productName: NonEmptyString
): TaskEither<ErrorResponses, Subscription> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.createSubscription({
        body: {
          product_name: productName
        },
        email: userEmail,
        subscription_id: subscriptionId
      }),
    200
  );

const createServiceTask = (
  logger: ILogger,
  apiClient: APIClient,
  servicePayload: ServicePayload,
  subscriptionId: NonEmptyString,
  sandboxFiscalCode: FiscalCode
): TaskEither<ErrorResponses, Service> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.createService({
        body: {
          ...servicePayload,
          authorized_recipients: [sandboxFiscalCode],
          service_id: subscriptionId // TODO insert check on ADB2C token_name from Active Directory, see https://www.pivotaltracker.com/story/show/174823724
        }
      }),
    200
  );

/**
 * Handles requests for create a service by a Service Payload.
 */
export function CreateServiceHandler(
  apiClient: APIClient,
  generateObjectId: ObjectIdGenerator,
  productName: NonEmptyString,
  sandboxFiscalCode: NonEmptyString
): ICreateServiceHandler {
  return (context, __, ___, userAttributes, servicePayload) => {
    const subscriptionId = generateObjectId();
    context.log(
      `${logPrefix}| Creating new service with subscriptionId=${subscriptionId}`
    );
    return createSubscriptionTask(
      getLogger(context, logPrefix, "CreateSubscription"),
      apiClient,
      userAttributes.email,
      subscriptionId,
      productName
    )
      .chain(subscription =>
        createServiceTask(
          getLogger(context, logPrefix, "CreateService"),
          apiClient,
          servicePayload,
          subscriptionId,
          (sandboxFiscalCode as unknown) as FiscalCode
        ).map(service =>
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
 * Wraps a CreateService handler inside an Express request handler.
 */
export function CreateService(
  serviceModel: ServiceModel,
  client: APIClient,
  productName: NonEmptyString,
  sandboxFiscalCode: NonEmptyString
): express.RequestHandler {
  const handler = CreateServiceHandler(
    client,
    ulidGenerator,
    productName,
    sandboxFiscalCode
  );
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
