import * as express from "express";

import {
  ClientIp,
  ClientIpMiddleware
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";

import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import {
  AzureUserAttributesMiddleware,
  IAzureUserAttributes
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
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

import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";

import { Context } from "@azure/functions";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import { TaskEither } from "fp-ts/lib/TaskEither";
import * as TE from "fp-ts/lib/TaskEither";
import { initAppInsights } from "@pagopa/ts-commons/lib/appinsights";
import { EmailString, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import { Service } from "@pagopa/io-functions-admin-sdk/Service";
import { SubscriptionKeys } from "@pagopa/io-functions-admin-sdk/SubscriptionKeys";
import { UserInfo } from "@pagopa/io-functions-admin-sdk/UserInfo";
import { StandardServiceCategoryEnum } from "@pagopa/io-functions-admin-sdk/StandardServiceCategory";
import { SpecialServiceMetadata } from "@pagopa/io-functions-admin-sdk/SpecialServiceMetadata";
import { SpecialServiceCategoryEnum } from "@pagopa/io-functions-admin-sdk/SpecialServiceCategory";
import { SequenceMiddleware } from "@pagopa/ts-commons/lib/sequence_middleware";
import {
  AzureUserAttributesManageMiddleware,
  IAzureUserAttributesManage
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes_manage";
import { SubscriptionCIDRsModel } from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
import { APIClient } from "../clients/admin";
import { ServicePayload } from "../generated/definitions/ServicePayload";
import { ServiceWithSubscriptionKeys } from "../generated/definitions/ServiceWithSubscriptionKeys";
import { withApiRequestWrapper } from "../utils/api";
import { getLogger, ILogger } from "../utils/logging";
import { ErrorResponses, IResponseErrorUnauthorized } from "../utils/responses";
import {
  serviceOwnerCheckManageTask,
  serviceOwnerCheckTask
} from "../utils/subscription";

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
  attrs: IAzureUserAttributes | IAzureUserAttributesManage,
  serviceId: NonEmptyString,
  servicePayload: ServicePayload
) => Promise<ResponseTypes>;

const logPrefix = "UpdateServiceHandler";

const getSubscriptionKeysTask = (
  logger: ILogger,
  apiClient: APIClient,
  serviceId: NonEmptyString
): TaskEither<ErrorResponses, SubscriptionKeys> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.getSubscriptionKeys({
        service_id: serviceId
      }),
    200
  );

const getServiceTask = (
  logger: ILogger,
  apiClient: APIClient,
  serviceId: NonEmptyString
): TaskEither<ErrorResponses, Service> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.getService({
        service_id: serviceId
      }),
    200
  );

const getUserTask = (
  logger: ILogger,
  apiClient: APIClient,
  userEmail: EmailString
): TaskEither<ErrorResponses, UserInfo> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.getUser({
        email: userEmail
      }),
    200
  );

const updateServiceTask = (
  logger: ILogger,
  apiClient: APIClient,
  servicePayload: ServicePayload,
  serviceId: NonEmptyString,
  retrievedService: Service,
  adb2cTokenName: NonEmptyString
  // eslint-disable-next-line max-params
): TaskEither<ErrorResponses, Service> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.updateService({
        body: {
          ...retrievedService,
          ...servicePayload,
          service_id: serviceId,
          // Only Admins can change service category and custom_special_flow name
          // calling directly the `io-functions-admin` functions.
          service_metadata: SpecialServiceMetadata.is(
            retrievedService.service_metadata
          )
            ? {
                ...servicePayload.service_metadata,
                category: SpecialServiceCategoryEnum.SPECIAL,
                custom_special_flow:
                  retrievedService.service_metadata.custom_special_flow,
                token_name: adb2cTokenName
              }
            : {
                ...servicePayload.service_metadata,
                category: StandardServiceCategoryEnum.STANDARD,
                token_name: adb2cTokenName
              }
        },
        service_id: serviceId
      }),
    200
  );

/**
 * Handles requests for updating a service by given serviceId and a Service Payload.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpdateServiceHandler(
  telemetryClient: ReturnType<typeof initAppInsights>,
  apiClient: APIClient
): IUpdateServiceHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, max-params
  return (_, apiAuth, ___, userAttributes, serviceId, servicePayload) =>
    pipe(
      pipe(
        serviceOwnerCheckTask(serviceId, apiAuth.subscriptionId),
        TE.orElse(__ =>
          serviceOwnerCheckManageTask(
            getLogger(_, logPrefix, "GetSubscription"),
            apiClient,
            serviceId,
            apiAuth.subscriptionId,
            apiAuth.userId
          )
        ),
        TE.chain(() =>
          pipe(
            getServiceTask(
              getLogger(_, logPrefix, "GetService"),
              apiClient,
              serviceId
            ),
            TE.chain(retrievedService =>
              pipe(
                getUserTask(
                  getLogger(_, logPrefix, "GetUser"),
                  apiClient,
                  userAttributes.email
                ),
                TE.chain(userInfo =>
                  updateServiceTask(
                    getLogger(_, logPrefix, "UpdateService"),
                    apiClient,
                    servicePayload,
                    serviceId,
                    retrievedService,
                    userInfo.token_name
                  )
                ),
                TE.chain(service => {
                  if (retrievedService.is_visible !== service.is_visible) {
                    telemetryClient.trackEvent({
                      name: "api.services.update",
                      properties: {
                        isVisible: String(service.is_visible),
                        requesterUserEmail: userAttributes.email,
                        serviceId
                      }
                    });
                  }
                  return pipe(
                    getSubscriptionKeysTask(
                      getLogger(_, logPrefix, "GetSubscriptionKeys"),
                      apiClient,
                      serviceId
                    ),
                    TE.map(subscriptionKeys =>
                      ResponseSuccessJson({
                        ...service,
                        ...subscriptionKeys
                      })
                    )
                  );
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
 * Wraps a UpdateService handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpdateService(
  telemetryClient: ReturnType<typeof initAppInsights>,
  serviceModel: ServiceModel,
  client: APIClient,
  subscriptionCIDRsModel: SubscriptionCIDRsModel
): express.RequestHandler {
  const handler = UpdateServiceHandler(telemetryClient, client);
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    ClientIpMiddleware,
    SequenceMiddleware(ResponseErrorForbiddenNotAuthorized)(
      AzureUserAttributesMiddleware(serviceModel),
      AzureUserAttributesManageMiddleware(subscriptionCIDRsModel)
    ),
    RequiredParamMiddleware("service_id", NonEmptyString),
    RequiredBodyPayloadMiddleware(ServicePayload)
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
