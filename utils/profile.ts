import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { LimitedProfile } from "@pagopa/io-functions-commons/dist/generated/definitions/LimitedProfile";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import { ValidService } from "@pagopa/io-functions-commons/dist/src/models/service";
import { IAzureApiAuthorization } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import { IRequestMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import { Some, isSome } from "fp-ts/lib/Option";
import {
  fromEither,
  fromLeft,
  fromPredicate,
  TaskEither,
  taskEither
} from "fp-ts/lib/TaskEither";
import { right } from "fp-ts/lib/Either";
import { identity } from "io-ts";
import {
  IResponseErrorForbiddenNotAuthorizedForRecipient,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorizedForRecipient,
  ResponseErrorFromValidationErrors,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { Task } from "fp-ts/lib/Task";
import { canWriteMessage } from "../CreateMessage/handler";
import { GetLimitedProfileByPOSTPayload } from "../generated/definitions/GetLimitedProfileByPOSTPayload";

/**
 * Whether the sender service is allowed to send
 * messages to the user identified by this profile
 * which servicesPreferencesSettings.mode is LEGACY
 */
export const isSenderAllowedLegacy = (
  blockedInboxOrChannels:
    | RetrievedProfile["blockedInboxOrChannels"]
    | undefined,
  serviceId: ServiceId
): TaskEither<never, boolean> =>
  taskEither.of(
    blockedInboxOrChannels === undefined ||
      blockedInboxOrChannels[serviceId] === undefined ||
      blockedInboxOrChannels[serviceId].indexOf(
        BlockedInboxOrChannelEnum.INBOX
      ) < 0
  );

/**
 * Converts the RetrievedProfile model to LimitedProfile type.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
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

export type IGetLimitedProfileResponses =
  | IResponseSuccessJson<LimitedProfile>
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseErrorForbiddenNotAuthorizedForRecipient;

export const getLimitedProfileTask = (
  apiAuthorization: IAzureApiAuthorization,
  userAttributes: IAzureUserAttributes,
  fiscalCode: FiscalCode,
  profileModel: ProfileModel,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: ReadonlyArray<ServiceId>
  // eslint-disable-next-line max-params
): Task<IGetLimitedProfileResponses> =>
  taskEither
    .of<
      | IResponseErrorForbiddenNotAuthorizedForRecipient
      | IResponseErrorNotFound
      | IResponseErrorQuery,
      void
    >(void 0)
    .chainSecond(
      // Sandboxed accounts will receive 403
      // if they're not authorized to send a messages to this fiscal code.
      // This prevents leaking the information, to sandboxed account,
      // that the fiscal code belongs to a subscribed user
      fromEither(
        canWriteMessage(
          apiAuthorization.groups,
          userAttributes.service.authorizedRecipients,
          fiscalCode
        )
      ).mapLeft(_ => ResponseErrorForbiddenNotAuthorizedForRecipient)
    ) // Verify if the Service has the required quality to sent message
    .chain(_ => {
      if (
        disableIncompleteServices &&
        !incompleteServiceWhitelist.includes(
          userAttributes.service.serviceId
        ) &&
        !userAttributes.service.authorizedRecipients.has(fiscalCode)
      ) {
        return fromEither(
          ValidService.decode(userAttributes.service).bimap(
            _1 => ResponseErrorForbiddenNotAuthorizedForRecipient,
            _1 => true
          )
        );
      }
      return fromEither(right(true));
    })
    .chain(_ =>
      profileModel
        .findLastVersionByModelId([fiscalCode])
        .mapLeft(error =>
          ResponseErrorQuery("Error while retrieving the profile", error)
        )
    )
    .chain(
      fromPredicate<IResponseErrorNotFound, Some<RetrievedProfile>>(
        maybeProfile =>
          isSome(maybeProfile) && maybeProfile.value.isInboxEnabled,
        _ =>
          ResponseErrorNotFound(
            "Profile not found",
            "The profile you requested was not found in the system."
          )
      )
    )
    .map(_ => _.value)
    .chain(service =>
      isSenderAllowedLegacy(
        service.blockedInboxOrChannels,
        userAttributes.service.serviceId
      ).map(isAllowed => ({
        isAllowed,
        service
      }))
    )
    .fold<IGetLimitedProfileResponses>(identity, ({ isAllowed, service }) =>
      ResponseSuccessJson(retrievedProfileToLimitedProfile(service, isAllowed))
    );
