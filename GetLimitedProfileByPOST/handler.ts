import * as express from "express";

import { isLeft, isRight } from "fp-ts/lib/Either";
import { isSome } from "fp-ts/lib/Option";

import { LimitedProfile } from "io-functions-commons/dist/generated/definitions/LimitedProfile";
import { ProfileModel } from "io-functions-commons/dist/src/models/profile";
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

import { canWriteMessage } from "../CreateMessage/handler";
import { GetLimitedProfileByPOSTPayload } from "../generated/definitions/GetLimitedProfileByPOSTPayload";
import {
  GetLimitedProfileByPOSTPayloadMiddleware,
  isSenderAllowed,
  retrievedProfileToLimitedProfile
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
>;

/**
 * Returns a type safe GetLimitedProfileByPOST handler.
 */
export function GetLimitedProfileByPOSTHandler(
  profileModel: ProfileModel
): IGetLimitedProfileByPOSTHandler {
  return async (auth, __, userAttributes, payload) => {
    const maybeProfileOrError = await profileModel.findOneProfileByFiscalCode(
      payload.fiscal_code
    );
    if (isRight(maybeProfileOrError)) {
      const maybeProfile = maybeProfileOrError.value;
      if (
        isSome(maybeProfile) &&
        // Sandboxed accounts will receive 404 even when the user exists
        // if they're not authorized to send a messages to this fiscal code.
        // This prevents leaking the information, to sandboxed account,
        // that the fiscal code belongs to a subscribed user
        isRight(
          canWriteMessage(
            auth.groups,
            userAttributes.service.authorizedRecipients,
            maybeProfile.value.fiscalCode
          )
        )
      ) {
        const profile = maybeProfile.value;

        return ResponseSuccessJson(
          retrievedProfileToLimitedProfile(
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
 * Wraps a GetLimitedProfileByPOST handler inside an Express request handler.
 */
export function GetLimitedProfileByPOST(
  serviceModel: ServiceModel,
  profileModel: ProfileModel
): express.RequestHandler {
  const handler = GetLimitedProfileByPOSTHandler(profileModel);

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
