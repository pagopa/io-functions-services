import * as express from "express";

import { LimitedProfile } from "@pagopa/io-functions-commons/dist/generated/definitions/LimitedProfile";
import { ProfileModel } from "@pagopa/io-functions-commons/dist/src/models/profile";
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
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { IResponseErrorQuery } from "@pagopa/io-functions-commons/dist/src/utils/response";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";
import {
  IResponseErrorForbiddenNotAuthorizedForRecipient,
  IResponseErrorNotFound,
  IResponseSuccessJson
} from "italia-ts-commons/lib/responses";

import { GetLimitedProfileByPOSTPayload } from "../generated/definitions/GetLimitedProfileByPOSTPayload";
import {
  GetLimitedProfileByPOSTPayloadMiddleware,
  getLimitedProfileTask
} from "../utils/profile";

/**
 * Type of a GetLimitedProfileByPOST handler.
 *
 * GetLimitedProfileByPOST expects a FiscalCode as input (in the body) and returns a LimitedProfile or a NotFound error.
 */
type IGetLimitedProfileByPOSTHandler = (
  apiAuthorization: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  payload: GetLimitedProfileByPOSTPayload
) => Promise<
  | IResponseSuccessJson<LimitedProfile>
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseErrorForbiddenNotAuthorizedForRecipient
>;

/**
 * Returns a type safe GetLimitedProfileByPOST handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetLimitedProfileByPOSTHandler(
  profileModel: ProfileModel,
  disableIncompleteServices: boolean
): IGetLimitedProfileByPOSTHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (auth, __, userAttributes, { fiscal_code }) =>
    getLimitedProfileTask(
      auth,
      userAttributes,
      fiscal_code,
      profileModel,
      disableIncompleteServices
    ).run();
}

/**
 * Wraps a GetLimitedProfileByPOST handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetLimitedProfileByPOST(
  serviceModel: ServiceModel,
  profileModel: ProfileModel,
  disableIncompleteServices: boolean
): express.RequestHandler {
  const handler = GetLimitedProfileByPOSTHandler(
    profileModel,
    disableIncompleteServices
  );

  const middlewaresWrap = withRequestMiddlewares(
    AzureApiAuthMiddleware(new Set([UserGroup.ApiLimitedProfileRead])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    GetLimitedProfileByPOSTPayloadMiddleware
  );

  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, c, u, __) => ipTuple(c, u))
    )
  );
}
