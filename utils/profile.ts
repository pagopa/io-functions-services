import { BlockedInboxOrChannelEnum } from "io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { LimitedProfile } from "io-functions-commons/dist/generated/definitions/LimitedProfile";
import { ServiceId } from "io-functions-commons/dist/generated/definitions/ServiceId";
import {
  IProfileBlockedInboxOrChannels,
  RetrievedProfile
} from "io-functions-commons/dist/src/models/profile";
import { IRequestMiddleware } from "io-functions-commons/dist/src/utils/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";
import { GetLimitedProfileByPOSTPayload } from "../generated/definitions/GetLimitedProfileByPOSTPayload";

/**
 * Whether the sender service is allowed to send
 * messages to the user identified by this profile
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
 * Converts the RetrievedProfile model to LimitedProfile type.
 */
export function retrievedProfileToLimitedProfile(
  retrivedProfile: RetrievedProfile,
  senderAllowed: boolean
): LimitedProfile {
  return {
    preferred_languages: retrivedProfile.preferredLanguages,
    // computed property
    sender_allowed: senderAllowed
  };
}

/**
 * A middleware that extracts a GetLimitedProfileByPOSTPayload from a request.
 */
export const GetLimitedProfileByPOSTPayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  GetLimitedProfileByPOSTPayload
> = request =>
  Promise.resolve(
    GetLimitedProfileByPOSTPayload.decode(request.body).mapLeft(
      ResponseErrorFromValidationErrors(GetLimitedProfileByPOSTPayload)
    )
  );
