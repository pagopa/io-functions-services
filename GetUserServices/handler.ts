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
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { EmailString, NonEmptyString } from "italia-ts-commons/lib/strings";

import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";

import { Context } from "@azure/functions";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { identity } from "fp-ts/lib/function";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { APIClient } from "../clients/admin";
import { UserInfo } from "../generated/api-admin/UserInfo";
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
): TaskEither<ErrorResponses, UserInfo> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.getUser({
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
  return (_, __, ___, userAttributes) => {
    return getUserTask(
      getLogger(_, logPrefix, "GetUser"),
      apiClient,
      userAttributes.email
    )
      .map(userInfo =>
        ResponseSuccessJson({
          items: userInfo.subscriptions.map(it =>
            ServiceId.encode(it.id as NonEmptyString)
          )
        })
      )
      .fold<IResponseSuccessJson<ServiceIdCollection> | ErrorResponses>(
        identity,
        identity
      )
      .run();
  };
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
