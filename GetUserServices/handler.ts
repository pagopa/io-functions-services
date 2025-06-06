import { Context } from "@azure/functions";
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
import { EmailString, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as express from "express";
import * as TE from "fp-ts/lib/TaskEither";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";

import { APIClient } from "../clients/admin";
import { ServiceIdCollection } from "../generated/definitions/ServiceIdCollection";
import { withApiRequestWrapper } from "../utils/api";
import { ILogger, getLogger } from "../utils/logging";
import { ErrorResponses } from "../utils/responses";

/**
 * Type of a GetUserServices handler.
 *
 * GetUserServices returns a list of ServiceId as output.
 */
type IGetUserServicesHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes
) => Promise<IResponseSuccessJson<ServiceIdCollection> | ErrorResponses>;

const logPrefix = "GetUserServicesHandler";

const getUserTask = (
  logger: ILogger,
  apiClient: APIClient,
  userEmail: EmailString
): TaskEither<ErrorResponses, UserInfoAndSubscriptions> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.getUserSubscriptions({
        email: userEmail
      }),
    200
  );

/**
 * Handles requests for getting an array of serviceID by providing the current user email.
 */
export function GetUserServicesHandler(
  apiClient: APIClient
): IGetUserServicesHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return (_, __, ___, userAttributes) =>
    pipe(
      getUserTask(
        getLogger(_, logPrefix, "GetUser"),
        apiClient,
        userAttributes.email
      ),
      TE.map((userInfo) =>
        ResponseSuccessJson({
          items: userInfo.subscriptions.map((it) =>
            ServiceId.encode(it.id as NonEmptyString)
          )
        })
      ),
      TE.toUnion
    )();
}

/**
 * Wraps a GetUserServices handler inside an Express request handler.
 */
export function GetUserServices(
  serviceModel: ServiceModel,
  client: APIClient
): express.RequestHandler {
  const handler = GetUserServicesHandler(client);
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceRead])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel)
  );
  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u) => ipTuple(c, u))
    )
  );
}
