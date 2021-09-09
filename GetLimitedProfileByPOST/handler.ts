import * as express from "express";

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
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";

import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { ServicesPreferencesModel } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { GetLimitedProfileByPOSTPayload } from "../generated/definitions/GetLimitedProfileByPOSTPayload";
import {
  GetLimitedProfileByPOSTPayloadMiddleware,
  IGetLimitedProfileResponses,
  getLimitedProfileTask
} from "../utils/profile";
import { initTelemetryClient } from "../utils/appinsights";

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
) => Promise<IGetLimitedProfileResponses>;

/**
 * Returns a type safe GetLimitedProfileByPOST handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetLimitedProfileByPOSTHandler(
  profileModel: ProfileModel,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: ReadonlyArray<ServiceId>,
  servicesPreferencesModel: ServicesPreferencesModel,
  telemetryClient: ReturnType<typeof initTelemetryClient>
): IGetLimitedProfileByPOSTHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (auth, __, userAttributes, { fiscal_code }) =>
    getLimitedProfileTask(
      auth,
      userAttributes,
      fiscal_code,
      profileModel,
      disableIncompleteServices,
      incompleteServiceWhitelist,
      servicesPreferencesModel,
      telemetryClient
    )();
}

/**
 * Wraps a GetLimitedProfileByPOST handler inside an Express request handler.
 */
// eslint-disable-next-line max-params,prefer-arrow/prefer-arrow-functions
export function GetLimitedProfileByPOST(
  serviceModel: ServiceModel,
  profileModel: ProfileModel,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: ReadonlyArray<ServiceId>,
  servicesPreferencesModel: ServicesPreferencesModel,
  telemetryClient: ReturnType<typeof initTelemetryClient>
): express.RequestHandler {
  const handler = GetLimitedProfileByPOSTHandler(
    profileModel,
    disableIncompleteServices,
    incompleteServiceWhitelist,
    servicesPreferencesModel,
    telemetryClient
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
