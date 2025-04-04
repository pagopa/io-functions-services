import { Context } from "@azure/functions";
import { Service } from "@pagopa/io-functions-admin-sdk/Service";
import { StandardServiceCategoryEnum } from "@pagopa/io-functions-admin-sdk/StandardServiceCategory";
import { Subscription } from "@pagopa/io-functions-admin-sdk/Subscription";
import { UserInfo } from "@pagopa/io-functions-admin-sdk/UserInfo";
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
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";
import {
  ObjectIdGenerator,
  ulidGenerator
} from "@pagopa/io-functions-commons/dist/src/utils/strings";
import { initAppInsights } from "@pagopa/ts-commons/lib/appinsights";
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
import {
  EmailString,
  FiscalCode,
  NonEmptyString
} from "@pagopa/ts-commons/lib/strings";
import * as express from "express";
import { sequenceS } from "fp-ts/lib/Apply";
import * as O from "fp-ts/lib/Option";
import { TaskEither } from "fp-ts/lib/TaskEither";
import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";

import { APIClient } from "../clients/admin";
import { ServicePayload } from "../generated/definitions/ServicePayload";
import { ServiceWithSubscriptionKeys } from "../generated/definitions/ServiceWithSubscriptionKeys";
import { withApiRequestWrapper } from "../utils/api";
import { ILogger, getLogger } from "../utils/logging";
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
  attrs: IAzureUserAttributes | IAzureUserAttributesManage,
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

const createServiceTask = (
  logger: ILogger,
  apiClient: APIClient,
  servicePayload: ServicePayload,
  subscriptionId: NonEmptyString,
  authorizedRecipients: ReadonlyArray<FiscalCode>,
  adb2cTokenName: NonEmptyString
  // eslint-disable-next-line max-params
): TaskEither<ErrorResponses, Service> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.createService({
        body: {
          ...servicePayload,
          authorized_recipients: authorizedRecipients,
          service_id: subscriptionId,
          service_metadata: {
            ...servicePayload.service_metadata,
            // Only Admins can create SPECIAL Services
            category: StandardServiceCategoryEnum.STANDARD,
            token_name: adb2cTokenName
          }
        }
      }),
    200
  );

export const getAuthorizedRecipientsFromPayload = (
  servicePayload: ServicePayload
): O.Option<ReadonlyArray<FiscalCode>> =>
  pipe(
    O.fromNullable(
      // eslint-disable-next-line @typescript-eslint/dot-notation
      servicePayload["authorized_recipients"] as ReadonlyArray<FiscalCode>
    ),
    O.map((items) =>
      items.map((cf) =>
        pipe(FiscalCode.decode(cf), O.fromEither, O.getOrElse(null))
      )
    )
  );

/**
 * Handles requests for create a service by a Service Payload.
 */
export function CreateServiceHandler(
  telemetryClient: ReturnType<typeof initAppInsights>,
  apiClient: APIClient,
  generateObjectId: ObjectIdGenerator,
  productName: NonEmptyString,
  sandboxFiscalCode: NonEmptyString
): ICreateServiceHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return (context, __, ___, userAttributes, servicePayload) => {
    const subscriptionId = generateObjectId();
    context.log.info(
      `${logPrefix}| Creating new service with subscriptionId=${subscriptionId}`
    );
    return pipe(
      sequenceS(TE.ApplicativePar)({
        subscription: createSubscriptionTask(
          getLogger(context, logPrefix, "CreateSubscription"),
          apiClient,
          userAttributes.email,
          subscriptionId,
          productName
        ),
        user: getUserTask(
          getLogger(context, logPrefix, "GetUser"),
          apiClient,
          userAttributes.email
        )
      }),
      TE.bind("service", ({ user }) =>
        createServiceTask(
          getLogger(context, logPrefix, "CreateService"),
          apiClient,
          servicePayload,
          subscriptionId,
          [
            sandboxFiscalCode as unknown as FiscalCode,
            ...pipe(
              getAuthorizedRecipientsFromPayload(servicePayload),
              O.getOrElse(() => [] as ReadonlyArray<FiscalCode>)
            )
          ],
          user.token_name
        )
      ),
      TE.map(({ service, subscription }) => {
        telemetryClient.trackEvent({
          name: "api.services.create",
          properties: {
            has_primary_key: Boolean(subscription.primary_key),
            has_secondary_key: Boolean(subscription.secondary_key),
            isVisible: String(service.is_visible),
            requesterUserEmail: userAttributes.email,
            subscriptionId
          }
        });
        return ResponseSuccessJson({
          ...service,
          primary_key: subscription.primary_key,
          secondary_key: subscription.secondary_key
        });
      }),
      TE.toUnion
    )();
  };
}

/**
 * Wraps a CreateService handler inside an Express request handler.
 */
export const CreateService =
  (telemetryClient: ReturnType<typeof initAppInsights>, client: APIClient) =>
  (
    productName: NonEmptyString,
    sandboxFiscalCode: NonEmptyString,
    serviceModel: ServiceModel,
    subscriptionCIDRsModel: SubscriptionCIDRsModel
  ): express.RequestHandler => {
    const handler = CreateServiceHandler(
      telemetryClient,
      client,
      ulidGenerator,
      productName,
      sandboxFiscalCode
    );
    const middlewaresWrap = withRequestMiddlewares(
      ContextMiddleware(),
      AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
      ClientIpMiddleware,
      SequenceMiddleware(ResponseErrorForbiddenNotAuthorized)(
        AzureUserAttributesMiddleware(serviceModel),
        AzureUserAttributesManageMiddleware(subscriptionCIDRsModel)
      ),
      RequiredBodyPayloadMiddleware(ServicePayload)
    );
    return wrapRequestHandler(
      middlewaresWrap(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
      )
    );
  };
