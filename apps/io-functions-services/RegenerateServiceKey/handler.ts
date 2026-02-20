import { InvocationContext } from "@azure/functions";
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
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
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
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { SequenceMiddleware } from "@pagopa/ts-commons/lib/sequence_middleware";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import { TaskEither } from "fp-ts/lib/TaskEither";

import { APIClient } from "../clients/admin";
import { SubscriptionKeys } from "../generated/definitions/SubscriptionKeys";
import { SubscriptionKeyTypePayload } from "../generated/definitions/SubscriptionKeyTypePayload";
import { withApiRequestWrapper } from "../utils/api";
import { getLogger, ILogger } from "../utils/logging";
import { ErrorResponses, IResponseErrorUnauthorized } from "../utils/responses";
import {
  serviceOwnerCheckManageTask,
  serviceOwnerCheckTask
} from "../utils/subscription";

type ResponseTypes =
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorTooManyRequests
  | IResponseErrorUnauthorized
  | IResponseSuccessJson<SubscriptionKeys>;

const logPrefix = "RegenerateServiceKeyHandler";

/**
 * Type of a RegenerateServiceKeyHandler handler.
 *
 * RegenerateServiceKey expects a service ID and a subscriptionKeyType as input
 * and returns regenerated subscriptionkeys as outcome
 */
type IRegenerateServiceKeyHandler = (
  context: InvocationContext,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes | IAzureUserAttributesManage,
  serviceId: NonEmptyString,
  subscriptionKeyTypePayload: SubscriptionKeyTypePayload
) => Promise<ResponseTypes>;

const regenerateServiceKeyTask = (
  logger: ILogger,
  apiClient: APIClient,
  serviceId: NonEmptyString,
  subscriptionKeyTypePayload: SubscriptionKeyTypePayload
): TaskEither<ErrorResponses, IResponseSuccessJson<SubscriptionKeys>> =>
  pipe(
    withApiRequestWrapper(
      logger,
      () =>
        apiClient.RegenerateSubscriptionKeys({
          body: subscriptionKeyTypePayload,
          service_id: serviceId
        }),
      200
    ),
    TE.chainW(
      TE.fromPredicate(
        subscriptionKeys => subscriptionKeys !== undefined,
        () =>
          ResponseErrorInternal(
            "Unexpected undefined response from RegenerateSubscriptionKeys API"
          )
      )
    ),
    TE.map(ResponseSuccessJson)
  );

/**
 * Wraps a RegenerateServiceKey handler inside a v4 Azure Function handler.
 */
export function RegenerateServiceKey(
  serviceModel: ServiceModel,
  client: APIClient,
  subscriptionCIDRsModel: SubscriptionCIDRsModel
) {
  const handler = RegenerateServiceKeyHandler(client);
  const middlewares = [
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    ClientIpMiddleware,
    SequenceMiddleware(ResponseErrorForbiddenNotAuthorized)(
      AzureUserAttributesMiddleware(serviceModel),
      AzureUserAttributesManageMiddleware(subscriptionCIDRsModel)
    ),
    RequiredParamMiddleware("service_id", NonEmptyString),
    RequiredBodyPayloadMiddleware(SubscriptionKeyTypePayload)
  ] as const;
  return wrapHandlerV4(
    middlewares,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    checkSourceIpForHandler(handler, (_, __, c, u, ___, ____) =>
      ipTuple(c, u)
    )
  );
}

/**
 * Handles requests for upload a service logo by a service ID and a base64 logo' s string.
 */
export function RegenerateServiceKeyHandler(
  apiClient: APIClient
): IRegenerateServiceKeyHandler {
  return (_, apiAuth, ___, ____, serviceId, subscriptionKeyTypePayload) =>
    pipe(
      serviceOwnerCheckTask(serviceId, apiAuth.subscriptionId),
      TE.orElse(() =>
        serviceOwnerCheckManageTask(
          getLogger(_, logPrefix, "GetSubscription"),
          apiClient,
          serviceId,
          apiAuth.subscriptionId,
          apiAuth.userId
        )
      ),
      TE.chain(() =>
        regenerateServiceKeyTask(
          getLogger(_, logPrefix, "RegenerateServiceKey"),
          apiClient,
          serviceId,
          subscriptionKeyTypePayload
        )
      ),
      TE.toUnion
    )();
}
