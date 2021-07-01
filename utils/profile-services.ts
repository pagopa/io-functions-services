import { LimitedProfile } from "@pagopa/io-functions-commons/dist/generated/definitions/LimitedProfile";
import { RetrievedProfile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import {
  RetrievedServicePreference,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { asyncIterableToArray } from "@pagopa/io-functions-commons/dist/src/utils/async";
import {
  IResponseErrorNotFound,
  ResponseErrorFromValidationErrors,
  ResponseErrorNotFound
} from "italia-ts-commons/lib/responses";
import * as e from "fp-ts/lib/Either";
import * as te from "fp-ts/lib/TaskEither";
import * as t from "fp-ts/lib/Task";
import { ServicesPreferencesModeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import * as a from "fp-ts/lib/Array";
import { IResponseErrorValidation } from "@pagopa/ts-commons/lib/responses";
import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { TaskEither } from "fp-ts/lib/TaskEither";

const NOT_FOUND_TITLE = "ServicesPreferences not found";

interface IServicePreferenceHandler {
  readonly isMyReposability: (profile: RetrievedProfile) => boolean;
  readonly handleProfile: (
    profile: RetrievedProfile,
    servicesPreferencesModel: ServicesPreferencesModel,
    serviceId: ServiceId
  ) => t.Task<LimitedProfile>;
}

const missingServicePreference = ResponseErrorNotFound(
  NOT_FOUND_TITLE,
  "The ServicesPreferences you requested was not found in the system."
);

/**
 * Converts the RetrievedProfile model to LimitedProfile type.
 */
export const retrievedProfileToLimitedProfile = (
  retrivedProfile: RetrievedProfile,
  senderAllowed: boolean
): LimitedProfile => ({
  preferred_languages: retrivedProfile.preferredLanguages,
  sender_allowed: senderAllowed
});

/**
 * Whether the sender service is allowed to send
 * messages to the user identified by this profile
 */
export const isSenderAllowed = (
  blockedInboxOrChannels:
    | RetrievedProfile["blockedInboxOrChannels"]
    | undefined,
  serviceId: ServiceId
): boolean =>
  blockedInboxOrChannels === undefined ||
  blockedInboxOrChannels[serviceId] === undefined ||
  blockedInboxOrChannels[serviceId].indexOf(BlockedInboxOrChannelEnum.INBOX) <
    0;

const findServicePreference = (
  servicesPreferencesModel: ServicesPreferencesModel,
  profile,
  serviceId: ServiceId
): te.TaskEither<IResponseErrorNotFound, RetrievedServicePreference> =>
  te
    .tryCatch(
      () =>
        asyncIterableToArray(
          servicesPreferencesModel.getQueryIterator({
            parameters: [
              {
                name: "@fiscalCode",
                value: profile.fiscalCode
              },
              {
                name: "@settingsVersion",
                value: profile.servicePreferencesSettings.version
              },
              {
                name: "@serviceId",
                value: serviceId
              }
            ],
            query: `
                SELECT *
                FROM c 
                WHERE 
                  c.fiscalCode = @fiscalCode 
                  AND 
                  c.settingsVersion = @settingsVersion
                  AND
                  c.serviceId = @serviceId
              `
          })
        ),
      () => missingServicePreference
    )
    .chain(preferences =>
      te.fromEither(
        a.fold<
          e.Either<IResponseErrorValidation, RetrievedServicePreference>,
          e.Either<IResponseErrorNotFound, RetrievedServicePreference>
        >(
          preferences
            .reduce((acc, val) => acc.concat(val), [])
            .map(pref =>
              pref.mapLeft(
                ResponseErrorFromValidationErrors(RetrievedServicePreference)
              )
            ),
          e.left(missingServicePreference),
          (h, _t) =>
            h.mapLeft(_errors =>
              ResponseErrorNotFound(
                NOT_FOUND_TITLE,
                "Can not decode the RetrievedServicePreference"
              )
            )
        )
      )
    );

const servicePreferenceToLimitedProfile = (
  profile: RetrievedProfile,
  servicePreference: RetrievedServicePreference
): LimitedProfile =>
  retrievedProfileToLimitedProfile(profile, servicePreference.isInboxEnabled);

export const profileWithPreferenceVersionWithModeAuto: IServicePreferenceHandler = {
  handleProfile: (profile, servicesPreferencesModel, serviceId) =>
    findServicePreference(servicesPreferencesModel, profile, serviceId).fold(
      _l => retrievedProfileToLimitedProfile(profile, true),
      servicePreference =>
        servicePreferenceToLimitedProfile(profile, servicePreference)
    ),
  isMyReposability: profile =>
    profile.servicePreferencesSettings.version >= 0 &&
    profile.servicePreferencesSettings.mode === ServicesPreferencesModeEnum.AUTO
};

export const profileWithPreferenceVersionWithModeManual: IServicePreferenceHandler = {
  handleProfile: (profile, servicesPreferencesModel, serviceId) =>
    findServicePreference(servicesPreferencesModel, profile, serviceId).fold(
      _l => retrievedProfileToLimitedProfile(profile, false),
      servicePreference =>
        servicePreferenceToLimitedProfile(profile, servicePreference)
    ),
  isMyReposability: profile =>
    profile.servicePreferencesSettings.version >= 0 &&
    profile.servicePreferencesSettings.mode ===
      ServicesPreferencesModeEnum.MANUAL
};

export const profileWithModeLegacy: IServicePreferenceHandler = {
  handleProfile: (profile, _servicesPreferencesModel, serviceId) =>
    t.task.of(
      retrievedProfileToLimitedProfile(
        profile,
        isSenderAllowed(profile.blockedInboxOrChannels, serviceId)
      )
    ),
  isMyReposability: profile =>
    profile.servicePreferencesSettings.mode ===
    ServicesPreferencesModeEnum.LEGACY
};

export const handle = (handler: IServicePreferenceHandler) => (
  profile: RetrievedProfile,
  servicesPreferencesModel: ServicesPreferencesModel,
  serviceId: ServiceId
): t.Task<e.Either<Error, LimitedProfile>> =>
  te
    .fromPredicate(
      handler.isMyReposability,
      _ => new Error("Handler not feasable!")
    )(profile)
    .chain(_ =>
      te.right(
        handler.handleProfile(profile, servicesPreferencesModel, serviceId)
      )
    )
    .fold(
      l => e.left(l),
      r => e.right(r)
    );

export const handleAll = () => (
  profile: RetrievedProfile,
  servicesPreferencesModel: ServicesPreferencesModel,
  serviceId: ServiceId
): te.TaskEither<IResponseErrorNotFound, LimitedProfile> =>
  new TaskEither(
    a.array
      .sequence(t.taskSeq)(
        [
          handle(profileWithPreferenceVersionWithModeAuto),
          handle(profileWithPreferenceVersionWithModeManual),
          handle(profileWithModeLegacy)
        ].map(h => h(profile, servicesPreferencesModel, serviceId))
      )
      .map(results =>
        a.findFirst(results, e.isRight).map(result => result.value)
      ) // TODO: concat errors and return an either instead of an option
      .map(
        e.fromOption(
          ResponseErrorNotFound(
            NOT_FOUND_TITLE,
            "Missing a feasable profile-service handler!"
          )
        )
      )
  );
