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

import { Task } from "fp-ts/lib/Task";
import { ServicesPreferencesModeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import {
  makeServicesPreferencesDocumentId,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  ResponseErrorInternal,
  IResponseErrorForbiddenNotAuthorizedForRecipient,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorizedForRecipient,
  ResponseErrorFromValidationErrors,
  ResponseErrorNotFound,
  ResponseSuccessJson,
  IResponseErrorInternal
} from "@pagopa/ts-commons/lib/responses";
import { GetLimitedProfileByPOSTPayload } from "../generated/definitions/GetLimitedProfileByPOSTPayload";
import { canWriteMessage } from "../CreateMessage/handler";
import { initTelemetryClient } from "./appinsights";
import { toHash } from "./crypto";

// Map an error when an unexpected value is passed
interface IUnexpectedValue {
  readonly kind: "UNEXPECTED_VALUE";
  readonly value: unknown;
}
/**
 * Creates a IUnexpectedValue error object
 * value is defined as never so the function can be used for exhaustive checks
 *
 * @param value the unexpected value
 * @returns a formatted IUnexpectedValue error
 */
const unexpectedValue = (value: never): IUnexpectedValue => ({
  kind: "UNEXPECTED_VALUE",
  value
});

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
      !blockedInboxOrChannels[serviceId].includes(
        BlockedInboxOrChannelEnum.INBOX
      )
  );

/**
 * Whether the sender service is allowed to send
 * messages to the user identified by this profile
 * which servicesPreferencesSettings.mode is NOT LEGACY
 */
export const isSenderAllowed = (
  servicesPreferencesModel: ServicesPreferencesModel,
  serviceId: ServiceId,
  fiscalCode: FiscalCode,
  {
    mode,
    version
  }: {
    readonly mode:
      | ServicesPreferencesModeEnum.AUTO
      | ServicesPreferencesModeEnum.MANUAL;
    readonly version: NonNegativeInteger;
  }
): TaskEither<CosmosErrors | IUnexpectedValue, boolean> =>
  taskEither
    .of<
      CosmosErrors | IUnexpectedValue,
      ReturnType<typeof makeServicesPreferencesDocumentId>
    >(makeServicesPreferencesDocumentId(fiscalCode, serviceId, version))
    .chain(docId => servicesPreferencesModel.find([docId, fiscalCode]))
    .chain(maybeDoc =>
      maybeDoc.foldL(
        // In case the user hasn't a specific preference for the service,
        //   use default behaviour depending on profile's mode
        () =>
          mode === ServicesPreferencesModeEnum.AUTO
            ? taskEither.of(true)
            : mode === ServicesPreferencesModeEnum.MANUAL
            ? taskEither.of(false)
            : fromLeft(unexpectedValue(mode)),
        // Read straight from the preference
        doc => taskEither.of(doc.isInboxEnabled)
      )
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

export type IGetLimitedProfileFailureResponses =
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseErrorInternal
  | IResponseErrorForbiddenNotAuthorizedForRecipient;
export type IGetLimitedProfileResponses =
  | IResponseSuccessJson<LimitedProfile>
  | IGetLimitedProfileFailureResponses;

export const getLimitedProfileTask = (
  apiAuthorization: IAzureApiAuthorization,
  userAttributes: IAzureUserAttributes,
  fiscalCode: FiscalCode,
  profileModel: ProfileModel,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: ReadonlyArray<ServiceId>,
  servicesPreferencesModel: ServicesPreferencesModel,
  telemetryClient: ReturnType<typeof initTelemetryClient>
): // eslint-disable-next-line max-params
Task<IGetLimitedProfileResponses> =>
  taskEither
    .of<IGetLimitedProfileFailureResponses, void>(void 0)
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
    .chain(profile => {
      // To determine allowance, use a different algorithm depending in subscription mode
      const isSenderAllowedTask =
        profile.servicePreferencesSettings.mode ===
        ServicesPreferencesModeEnum.LEGACY
          ? isSenderAllowedLegacy(
              profile.blockedInboxOrChannels,
              userAttributes.service.serviceId
            )
          : isSenderAllowed(
              servicesPreferencesModel,
              userAttributes.service.serviceId,
              profile.fiscalCode,
              profile.servicePreferencesSettings
            );

      return isSenderAllowedTask
        .bimap(
          error =>
            error.kind === "UNEXPECTED_VALUE"
              ? ResponseErrorInternal(`Unexpected mode: ${error.value}`)
              : ResponseErrorQuery(
                  "Failed to read preference for the given service",
                  error
                ),
          isAllowed => ({
            isAllowed,
            profile
          })
        )
        .map(_ => {
          telemetryClient.trackEvent({
            name: "api.limitedprofile.sender-allowed",
            properties: {
              fiscalCode: toHash(profile.fiscalCode),
              isAllowed: String(_.isAllowed),
              mode: profile.servicePreferencesSettings.mode,
              serviceId: userAttributes.service.serviceId
            },
            tagOverrides: { samplingEnabled: "false" }
          });
          return _;
        });
    })
    .fold<IGetLimitedProfileResponses>(identity, ({ isAllowed, profile }) =>
      ResponseSuccessJson(retrievedProfileToLimitedProfile(profile, isAllowed))
    );
