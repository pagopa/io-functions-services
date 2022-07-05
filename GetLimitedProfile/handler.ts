import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { ProfileModel } from "@pagopa/io-functions-commons/dist/src/models/profile";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { ServicesPreferencesModel } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
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
import { FiscalCodeMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/fiscalcode";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";
import * as express from "express";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { ActivationModel } from "@pagopa/io-functions-commons/dist/src/models/activation";
import { initTelemetryClient } from "../utils/appinsights";

import {
  getLimitedProfileTask,
  IGetLimitedProfileResponses
} from "../utils/profile";
import { canSendMessageOnActivationWithGrace } from "../utils/services";

/**
 * Type of a GetLimitedProfile handler.
 *
 * GetLimitedProfile expects a FiscalCode as input and returns a LimitedProfile or a NotFound error.
 */

type IGetLimitedProfileHandler = (
  apiAuthorization: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  fiscalCode: FiscalCode
) => Promise<IGetLimitedProfileResponses>;

/**
 * Returns a type safe GetLimitedProfile handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, max-params
export function GetLimitedProfileHandler(
  profileModel: ProfileModel,
  serviceActivationModel: ActivationModel,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: ReadonlyArray<ServiceId>,
  servicesPreferencesModel: ServicesPreferencesModel,
  canSendMessageOnActivation: ReturnType<
    typeof canSendMessageOnActivationWithGrace
  >,
  telemetryClient: ReturnType<typeof initTelemetryClient>
): IGetLimitedProfileHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (auth, __, userAttributes, fiscalCode) =>
    getLimitedProfileTask(
      auth,
      userAttributes,
      fiscalCode,
      profileModel,
      disableIncompleteServices,
      incompleteServiceWhitelist,
      servicesPreferencesModel,
      serviceActivationModel,
      canSendMessageOnActivation,
      telemetryClient
    )();
}

/**
 * Wraps a GetLimitedProfile handler inside an Express request handler.
 */
// eslint-disable-next-line max-params,prefer-arrow/prefer-arrow-functions
export function GetLimitedProfile(
  serviceModel: ServiceModel,
  profileModel: ProfileModel,
  serviceActivationModel: ActivationModel,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: ReadonlyArray<ServiceId>,
  servicesPreferencesModel: ServicesPreferencesModel,
  canSendMessageOnActivation: ReturnType<
    typeof canSendMessageOnActivationWithGrace
  >,
  telemetryClient: ReturnType<typeof initTelemetryClient>
): express.RequestHandler {
  const handler = GetLimitedProfileHandler(
    profileModel,
    serviceActivationModel,
    disableIncompleteServices,
    incompleteServiceWhitelist,
    servicesPreferencesModel,
    canSendMessageOnActivation,
    telemetryClient
  );

  const middlewaresWrap = withRequestMiddlewares(
    AzureApiAuthMiddleware(new Set([UserGroup.ApiLimitedProfileRead])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    FiscalCodeMiddleware
  );

  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, c, u, __) => ipTuple(c, u))
    )
  );
}
