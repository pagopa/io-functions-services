import { InvocationContext } from "@azure/functions";
import { Service } from "@pagopa/io-functions-admin-sdk/Service";
import { StandardServiceCategoryEnum } from "@pagopa/io-functions-admin-sdk/StandardServiceCategory";
import { Subscription } from "@pagopa/io-functions-admin-sdk/Subscription";
import { UserInfo } from "@pagopa/io-functions-admin-sdk/UserInfo";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { SubscriptionCIDRsModel } from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
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
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { SequenceMiddleware } from "@pagopa/ts-commons/lib/sequence_middleware";
import {
  EmailString,
  FiscalCode,
  NonEmptyString
} from "@pagopa/ts-commons/lib/strings";
import { sequenceS } from "fp-ts/lib/Apply";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import { TaskEither } from "fp-ts/lib/TaskEither";
import * as TE from "fp-ts/lib/TaskEither";

import { APIClient } from "../clients/admin";
import { ServiceMetadata } from "../generated/definitions/ServiceMetadata";
import { ServicePayload } from "../generated/definitions/ServicePayload";
import { ServiceWithSubscriptionKeys } from "../generated/definitions/ServiceWithSubscriptionKeys";
import { withApiRequestWrapper } from "../utils/api";
import { getLogger, ILogger } from "../utils/logging";
import { ErrorResponses, IResponseErrorUnauthorized } from "../utils/responses";

type ResponseTypes =
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorTooManyRequests
  | IResponseErrorUnauthorized
  | IResponseSuccessJson<ServiceWithSubscriptionKeys>;

const logPrefix = "CreateServiceHandler";

/**
 * Type of a CreateService handler.
 *
 * CreateService expects a service payload as input
 * and returns service with subscription keys
 */
type ICreateServiceHandler = (
  context: InvocationContext,
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
  pipe(
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
    ),
    TE.chainW(
      TE.fromPredicate(
        subscription => subscription !== undefined,
        () =>
          ResponseErrorInternal(
            "Unexpected undefined response from createSubscription API"
          )
      )
    )
  );

const getUserTask = (
  logger: ILogger,
  apiClient: APIClient,
  userEmail: EmailString
): TaskEither<ErrorResponses, UserInfo> =>
  pipe(
    withApiRequestWrapper(
      logger,
      () =>
        apiClient.getUser({
          email: userEmail
        }),
      200
    ),
    TE.chainW(
      TE.fromPredicate(
        userInfo => userInfo !== undefined,
        () =>
          ResponseErrorInternal(
            "Unexpected undefined response from getUser API"
          )
      )
    )
  );

const createServiceTask = (
  logger: ILogger,
  apiClient: APIClient,
  servicePayload: ServicePayload,
  subscriptionId: NonEmptyString,
  authorizedRecipients: readonly FiscalCode[],
  adb2cTokenName: NonEmptyString
): TaskEither<ErrorResponses, Service> =>
  pipe(
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
            } as ServiceMetadata
          }
        }),
      200
    ),
    TE.chainW(
      TE.fromPredicate(
        service => service !== undefined,
        () =>
          ResponseErrorInternal(
            "Unexpected undefined response from createService API"
          )
      )
    )
  );

// export const getAuthorizedRecipientsFromPayload2 = (
//   servicePayload: ServicePayload
// ): O.Option<readonly FiscalCode[]> =>
//   pipe(
//     O.fromNullable(
//       // eslint-disable-next-line @typescript-eslint/dot-notation
//       servicePayload["authorized_recipients"] as readonly FiscalCode[]
//     ),
//     O.map(items =>
//       items.map(cf =>
//         pipe(FiscalCode.decode(cf), O.fromEither, O.getOrElse(null))
//       )
//     )
//   );

export const getAuthorizedRecipientsFromPayload = (
  servicePayload: ServicePayload
): O.Option<readonly FiscalCode[]> =>
  pipe(
    O.fromNullable(
      "authorized_recipients" in servicePayload
        ? (servicePayload.authorized_recipients as readonly FiscalCode[])
        : undefined
    ),
    O.map(items =>
      items
        .map(cf =>
          pipe(
            FiscalCode.decode(cf),
            O.fromEither,
            // convert Option<FiscalCode> to FiscalCode | undefined
            O.toNullable
          )
        )
        // filter out invalid (undefined) values
        .filter((v): v is FiscalCode => v !== null)
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
  return (context, __, ___, userAttributes, servicePayload) => {
    const subscriptionId = generateObjectId();
    context.info(
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
              O.getOrElse(() => [] as readonly FiscalCode[])
            )
          ],
          user.token_name as NonEmptyString
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
  ) => {
    const handler = CreateServiceHandler(
      telemetryClient,
      client,
      ulidGenerator,
      productName,
      sandboxFiscalCode
    );
    const middlewares = [
      ContextMiddleware(),
      AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
      ClientIpMiddleware,
      SequenceMiddleware(ResponseErrorForbiddenNotAuthorized)(
        AzureUserAttributesMiddleware(serviceModel),
        AzureUserAttributesManageMiddleware(subscriptionCIDRsModel)
      ),
      RequiredBodyPayloadMiddleware(ServicePayload)
    ] as const;
    return wrapHandlerV4(
      middlewares,
      checkSourceIpForHandler(handler, (_, __, c, u) => ipTuple(c, u))
    );
  };
