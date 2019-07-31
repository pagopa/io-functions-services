import * as express from "express";
import { isRight } from "fp-ts/lib/Either";
import { isSome } from "fp-ts/lib/Option";
import { BlockedInboxOrChannelEnum } from "io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { LimitedProfile } from "io-functions-commons/dist/generated/definitions/LimitedProfile";
import { ServiceId } from "io-functions-commons/dist/generated/definitions/ServiceId";
import {
  IProfileBlockedInboxOrChannels,
  Profile,
  ProfileModel
} from "io-functions-commons/dist/src/models/profile";
import { ServiceModel } from "io-functions-commons/dist/src/models/service";
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
  ClientIp,
  ClientIpMiddleware
} from "io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";
import { FiscalCodeMiddleware } from "io-functions-commons/dist/src/utils/middlewares/fiscalcode";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "io-functions-commons/dist/src/utils/response";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "io-functions-commons/dist/src/utils/source_ip_check";
import {
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { FiscalCode } from "italia-ts-commons/lib/strings";

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
) => Promise<
  | IResponseSuccessJson<LimitedProfile>
  | IResponseErrorNotFound
  | IResponseErrorQuery
>;

/**
 * Whether the sender service is allowed to send
 * notififications to the user identified by this profile
 */
export function isSenderAllowed(
  blockedInboxOrChannels: IProfileBlockedInboxOrChannels | undefined,
  serviceId: ServiceId
): boolean {
  return (
    blockedInboxOrChannels === undefined ||
    blockedInboxOrChannels[serviceId] === undefined ||
    !blockedInboxOrChannels[serviceId].has(BlockedInboxOrChannelEnum.INBOX)
  );
}

/**
 * Converts the Profile model to LimetedProfile type.
 */
export function toLimitedProfile(
  profile: Profile,
  senderAllowed: boolean
): LimitedProfile {
  return {
    preferred_languages: profile.preferredLanguages,
    // computed property
    sender_allowed: senderAllowed
  };
}

/**
 * Returns a type safe GetLimitedProfile handler.
 */
export function GetLimitedProfileHandler(
  profileModel: ProfileModel
): IGetLimitedProfileHandler {
  return async (_, __, userAttributes, fiscalCode) => {
    const maybeProfileOrError = await profileModel.findOneProfileByFiscalCode(
      fiscalCode
    );
    if (isRight(maybeProfileOrError)) {
      const maybeProfile = maybeProfileOrError.value;
      if (isSome(maybeProfile)) {
        const profile = maybeProfile.value;

        return ResponseSuccessJson(
          toLimitedProfile(
            profile,
            isSenderAllowed(
              profile.blockedInboxOrChannels,
              userAttributes.service.serviceId
            )
          )
        );
      } else {
        return ResponseErrorNotFound(
          "Profile not found",
          "The profile you requested was not found in the system."
        );
      }
    } else {
      return ResponseErrorQuery(
        "Error while retrieving the profile",
        maybeProfileOrError.value
      );
    }
  };
}

/**
 * Wraps a GetLimitedProfile handler inside an Express request handler.
 */
export function GetLimitedProfile(
  serviceModel: ServiceModel,
  profileModel: ProfileModel
): express.RequestHandler {
  const handler = GetLimitedProfileHandler(profileModel);

  const middlewaresWrap = withRequestMiddlewares(
    AzureApiAuthMiddleware(
      new Set([UserGroup.ApiLimitedProfileRead, UserGroup.ApiFullProfileRead])
    ),
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
