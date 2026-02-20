import { InvocationContext } from "@azure/functions";
import { UserInfoAndSubscriptions } from "@pagopa/io-functions-admin-sdk/UserInfoAndSubscriptions";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
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
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";
import {
  IResponseSuccessJson,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { EmailString, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import { TaskEither } from "fp-ts/lib/TaskEither";

import { APIClient } from "../clients/admin";
import { ServiceIdCollection } from "../generated/definitions/ServiceIdCollection";
import { withApiRequestWrapper } from "../utils/api";
import { getLogger, ILogger } from "../utils/logging";
import { ErrorResponses } from "../utils/responses";

/**
 * Type of a GetUserServices handler.
 *
 * GetUserServices returns a list of ServiceId as output.
 */
type IGetUserServicesHandler = (
  context: InvocationContext,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes
) => Promise<ErrorResponses | IResponseSuccessJson<ServiceIdCollection>>;

const logPrefix = "GetUserServicesHandler";

const getUserTask = (
  logger: ILogger,
  apiClient: APIClient,
  userEmail: EmailString
): TaskEither<ErrorResponses, UserInfoAndSubscriptions> =>
  pipe(
    withApiRequestWrapper(
      logger,
      () =>
        apiClient.getUserSubscriptions({
          email: userEmail
        }),
      200
    ),
    TE.map(s => s as UserInfoAndSubscriptions)
  );

/**
 * Wraps a GetUserServices handler inside an Express request handler.
 */
export function GetUserServices(serviceModel: ServiceModel, client: APIClient) {
  const handler = GetUserServicesHandler(client);
  const middlewares = [
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceRead])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel)
  ] as const;
  return wrapHandlerV4(
    middlewares,
    checkSourceIpForHandler(handler, (_, __, c, u) => ipTuple(c, u))
  );
}

/**
 * Handles requests for getting an array of serviceID by providing the current user email.
 */
export function GetUserServicesHandler(
  apiClient: APIClient
): IGetUserServicesHandler {
  return (_, __, ___, userAttributes) =>
    pipe(
      getUserTask(
        getLogger(_, logPrefix, "GetUser"),
        apiClient,
        userAttributes.email
      ),
      TE.map(userInfo =>
        ResponseSuccessJson({
          items: (userInfo.subscriptions ?? []).map(it =>
            ServiceId.encode(it.id as NonEmptyString)
          )
        })
      ),
      TE.toUnion
    )();
}
