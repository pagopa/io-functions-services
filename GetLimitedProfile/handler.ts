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
import { FiscalCodeMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/fiscalcode";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";
import * as express from "express";
import { isLeft, isRight } from "fp-ts/lib/Either";
import { isSome } from "fp-ts/lib/Option";
import {
  IResponseErrorForbiddenNotAuthorizedForRecipient,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorizedForRecipient,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { FiscalCode } from "italia-ts-commons/lib/strings";

import { canWriteMessage } from "../CreateMessage/handler";
import {
  isSenderAllowed,
  retrievedProfileToLimitedProfile
} from "../utils/profile";

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
  | IResponseErrorForbiddenNotAuthorizedForRecipient
>;

/**
 * Returns a type safe GetLimitedProfile handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention
export function GetLimitedProfileHandler(
  profileModel: ProfileModel
): IGetLimitedProfileHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (auth, __, userAttributes, fiscalCode) => {
    // Sandboxed accounts will receive 403
    // if they're not authorized to send a messages to this fiscal code.
    // This prevents leaking the information, to sandboxed account,
    // that the fiscal code belongs to a subscribed user
    if (
      isLeft(
        canWriteMessage(
          auth.groups,
          userAttributes.service.authorizedRecipients,
          fiscalCode
        )
      )
    ) {
      return ResponseErrorForbiddenNotAuthorizedForRecipient;
    }

    const maybeProfileOrError = await profileModel
      .findLastVersionByModelId([fiscalCode])
      .run();

    if (isRight(maybeProfileOrError)) {
      const maybeProfile = maybeProfileOrError.value;

      // We also return ResponseErrorNotFound in case the profile is found
      // but the inbox is not enabled (onboarding not completed).
      if (isSome(maybeProfile) && maybeProfile.value.isInboxEnabled) {
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
 * Wraps a GetLimitedProfile handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention
export function GetLimitedProfile(
  serviceModel: ServiceModel,
  profileModel: ProfileModel
): express.RequestHandler {
  const handler = GetLimitedProfileHandler(profileModel);

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
