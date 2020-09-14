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
import { errorsToReadableMessages } from "italia-ts-commons/lib/reporters";
import { EmailString, NonEmptyString } from "italia-ts-commons/lib/strings";
import { Service } from "../generated/api-admin/Service";
import { Subscription } from "../generated/api-admin/Subscription";
import { ServicePayload } from "../generated/definitions/ServicePayload";
import { ServiceWithSubscriptionKeys } from "../generated/definitions/ServiceWithSubscriptionKeys";
import { APIClient } from "../utils/clients/admin";
import {
  ErrorResponses,
  IResponseErrorUnauthorized,
  toDefaultResponseErrorInternal,
  toErrorServerResponse
} from "../utils/responses";

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
  context: Context,
  apiClient: ReturnType<APIClient>,
  userEmail: EmailString,
  subscriptionId: NonEmptyString,
  productName: NonEmptyString
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
    errs => {
      context.log(
        `${logPrefix}| createSubscriptionTask on call errs=${JSON.stringify(
          errs
        )}`
      );
      return toDefaultResponseErrorInternal(errs);
    }
  ).foldTaskEither(
    err => fromLeft(err),
    errorOrResponse =>
      errorOrResponse.fold(
        errs => {
          context.log(
            `${logPrefix}| createSubscriptionTask Errors=${errorsToReadableMessages(
              errs
            )}`
          );
          return fromLeft(toDefaultResponseErrorInternal(errs));
        },
        responseType =>
          responseType.status !== 200
            ? fromLeft(toErrorServerResponse(responseType))
            : taskEither.of(responseType.value)
      )
  );
const createServiceTask = (
  context: Context,
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
    errs => {
      context.log(
        `${logPrefix}| createServiceTask on call errs=${JSON.stringify(errs)}`
      );
      return toDefaultResponseErrorInternal(errs);
    }
  ).foldTaskEither(
    err => fromLeft(err),
    errorOrResponse =>
      errorOrResponse.fold(
        errs => {
          context.log(
            `${logPrefix}| createServiceTask Errors=${errorsToReadableMessages(
              errs
            )}`
          );
          return fromLeft(toDefaultResponseErrorInternal(errs));
        },
        responseType =>
          responseType.status !== 200
            ? fromLeft(toErrorServerResponse(responseType))
            : taskEither.of(responseType.value)
      )
  );

/**
 * Handles requests for create a service by a Service Payload.
 */
export function CreateServiceHandler(
  apiClient: ReturnType<APIClient>,
  generateObjectId: ObjectIdGenerator,
  productName: NonEmptyString
): ICreateServiceHandler {
  return (context, __, ___, userAttributes, servicePayload) => {
    const subscriptionId = generateObjectId();
    context.log.info(
      `${logPrefix}| Creating new service with subscriptionId=${subscriptionId}`
    );
    return createSubscriptionTask(
      context,
      apiClient,
      userAttributes.email,
      subscriptionId,
      productName
    )
      .chain(subscription =>
        createServiceTask(
          context,
          apiClient,
          servicePayload,
          subscriptionId
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
  client: ReturnType<APIClient>,
  productName: NonEmptyString
): express.RequestHandler {
  const handler = CreateServiceHandler(client, ulidGenerator, productName);
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
