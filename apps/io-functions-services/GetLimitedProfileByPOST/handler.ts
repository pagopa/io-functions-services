import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { ActivationModel } from "@pagopa/io-functions-commons/dist/src/models/activation";
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
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";
import { FiscalCodePayload } from "../generated/definitions/FiscalCodePayload";
import { initTelemetryClient } from "../utils/appinsights";
import {
  FiscalCodePayloadMiddleware,
  getLimitedProfileTask,
  IGetLimitedProfileResponses
} from "../utils/profile";
import { CanSendMessageOnActivation } from "../utils/services";

/**
 * Type of a GetLimitedProfileByPOST handler.
 *
 * GetLimitedProfileByPOST expects a FiscalCode as input (in the body) and returns a LimitedProfile or a NotFound error.
 */
type IGetLimitedProfileByPOSTHandler = (
  apiAuthorization: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  payload: FiscalCodePayload
) => Promise<IGetLimitedProfileResponses>;

/**
 * Wraps a GetLimitedProfileByPOST handler inside an Express request handler.
 */
export function GetLimitedProfileByPOST(
  serviceModel: ServiceModel,
  profileModel: ProfileModel,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: readonly ServiceId[],
  servicesPreferencesModel: ServicesPreferencesModel,
  serviceActivationModel: ActivationModel,
  canSendMessageOnActivation: CanSendMessageOnActivation,
  telemetryClient: ReturnType<typeof initTelemetryClient>
) {
  const handler = GetLimitedProfileByPOSTHandler(
    profileModel,
    disableIncompleteServices,
    incompleteServiceWhitelist,
    servicesPreferencesModel,
    serviceActivationModel,
    canSendMessageOnActivation,
    telemetryClient
  );

  const middlewares = [
    AzureApiAuthMiddleware(new Set([UserGroup.ApiLimitedProfileRead])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    FiscalCodePayloadMiddleware
  ] as const;

  return wrapHandlerV4(
    middlewares,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    checkSourceIpForHandler(handler, (_, c, u, __) => ipTuple(c, u))
  );
}

/**
 * Returns a type safe GetLimitedProfileByPOST handler.
 */
export function GetLimitedProfileByPOSTHandler(
  profileModel: ProfileModel,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: readonly ServiceId[],
  servicesPreferencesModel: ServicesPreferencesModel,
  serviceActivationModel: ActivationModel,
  canSendMessageOnActivation: CanSendMessageOnActivation,
  telemetryClient: ReturnType<typeof initTelemetryClient>
): IGetLimitedProfileByPOSTHandler {
  return async (auth, __, userAttributes, { fiscal_code }) =>
    getLimitedProfileTask(
      auth,
      userAttributes,
      fiscal_code,
      profileModel,
      disableIncompleteServices,
      incompleteServiceWhitelist,
      servicesPreferencesModel,
      serviceActivationModel,
      canSendMessageOnActivation,
      telemetryClient
    )();
}
