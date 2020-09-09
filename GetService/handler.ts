import * as express from "express";

import {
  ClientIp,
  ClientIpMiddleware
} from "io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";

import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";

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
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "io-functions-commons/dist/src/utils/source_ip_check";

import { Context } from "@azure/functions";
import { Either, isLeft } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { tryCatch } from "fp-ts/lib/TaskEither";
import { ServiceModel } from "io-functions-commons/dist/src/models/service";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { Errors } from "io-ts";
import { IResponseType } from "italia-ts-commons/lib/requests";
import { ServiceWithSubscriptionKeys } from "../generated/definitions/ServiceWithSubscriptionKeys";
import { APIClient } from "../utils/clients/admin";
import {
  IResponseErrorUnauthorized,
  ResponseErrorUnauthorized
} from "../utils/responses";
import { FiscalCode } from "io-functions-commons/dist/generated/definitions/FiscalCode";

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
  serviceId: string
) => Promise<
  // tslint:disable-next-line:max-union-size
  | IResponseSuccessJson<ServiceWithSubscriptionKeys>
  | IResponseErrorNotFound
  | IResponseErrorUnauthorized
  | IResponseErrorInternal
>;

const toServerResponse = <S extends number, T>(
  maybeResponse: Either<Errors, IResponseType<S, T>>
) => {
  if (isLeft(maybeResponse)) {
    return ResponseErrorInternal(JSON.stringify(maybeResponse.value));
  }
  const response = maybeResponse.value;
  if (response.status === 200) {
    return ResponseSuccessJson(response.value);
  }

  if (response.status === 401) {
    return ResponseErrorUnauthorized("Unauthorized", "Unauthorized");
  }

  if (response.status === 404) {
    return ResponseErrorNotFound("Not found", "Resource not found");
  }
};

/**
 * Handles requests for getting a single service by a service ID.
 */
export function GetServiceHandler(
  apiClient: ReturnType<APIClient>
): IGetServiceHandler {
  return (context, _, __, userAttributes, serviceId) => {
    const x = tryCatch(
      () =>
        apiClient.getService({
          service_id: serviceId
        }),
      errs => ResponseErrorInternal(JSON.stringify(errs))
    )
      .map(res => toServerResponse(res))
      .fold(identity, identity)
      .run();

    return x;
  };
}

/**
 * Wraps a GetService handler inside an Express request handler.
 */
export function GetService(
  serviceModel: ServiceModel,
  client: ReturnType<APIClient>
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
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}
