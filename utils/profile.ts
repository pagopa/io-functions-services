import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { LimitedProfile } from "@pagopa/io-functions-commons/dist/generated/definitions/LimitedProfile";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { RetrievedProfile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import { IRequestMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";
import { GetLimitedProfileByPOSTPayload } from "../generated/definitions/GetLimitedProfileByPOSTPayload";

/**
 * Whether the sender service is allowed to send
 * messages to the user identified by this profile
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function isSenderAllowed(
  blockedInboxOrChannels:
    | RetrievedProfile["blockedInboxOrChannels"]
    | undefined,
  serviceId: ServiceId
): boolean {
  return (
    blockedInboxOrChannels === undefined ||
    blockedInboxOrChannels[serviceId] === undefined ||
    blockedInboxOrChannels[serviceId].indexOf(BlockedInboxOrChannelEnum.INBOX) <
      0
  );
}

/**
 * Converts the RetrievedProfile model to LimitedProfile type.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function retrievedProfileToLimitedProfile(
  retrivedProfile: RetrievedProfile,
  senderAllowed: boolean
): LimitedProfile {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    preferred_languages: retrivedProfile.preferredLanguages,
    // computed property
    // eslint-disable-next-line @typescript-eslint/naming-convention
    sender_allowed: senderAllowed
  };
}

/**
 * A middleware that extracts a GetLimitedProfileByPOSTPayload from a request.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const GetLimitedProfileByPOSTPayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  GetLimitedProfileByPOSTPayload
> = request =>
  Promise.resolve(
    GetLimitedProfileByPOSTPayload.decode(request.body).mapLeft(
      ResponseErrorFromValidationErrors(GetLimitedProfileByPOSTPayload)
    )
  );
