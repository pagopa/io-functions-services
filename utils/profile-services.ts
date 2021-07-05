import { LimitedProfile } from "@pagopa/io-functions-commons/dist/generated/definitions/LimitedProfile";
import { RetrievedProfile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import {
  makeServicesPreferencesDocumentId,
  RetrievedServicePreference,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import {
  IResponseErrorNotFound,
  ResponseErrorNotFound
} from "italia-ts-commons/lib/responses";
import * as e from "fp-ts/lib/Either";
import * as te from "fp-ts/lib/TaskEither";
import * as t from "fp-ts/lib/Task";
import { ServicesPreferencesModeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import * as a from "fp-ts/lib/Array";
import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";

const NOT_FOUND_TITLE = "ServicesPreferences not found";

interface IServicePreferenceHandler {
  readonly isMyReposability: (profile: RetrievedProfile) => boolean;
  readonly handleProfile: (
    profile: RetrievedProfile,
    servicesPreferencesModel: ServicesPreferencesModel,
    serviceId: ServiceId
  ) => t.Task<LimitedProfile>;
}

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
  profile: RetrievedProfile,
  serviceId: ServiceId
): te.TaskEither<IResponseErrorNotFound, RetrievedServicePreference> =>
  te
    .fromEither(
      NonNegativeInteger.decode(profile.servicePreferencesSettings.version)
    )
    .mapLeft(_ =>
      ResponseErrorNotFound(
        NOT_FOUND_TITLE,
        "preferences settings version must be a natural number"
      )
    )
    .chain(version =>
      servicesPreferencesModel
        .find([
          makeServicesPreferencesDocumentId(
            profile.fiscalCode,
            serviceId,
            version
          ),
          profile.fiscalCode
        ])
        .mapLeft(_ =>
          ResponseErrorNotFound(
            NOT_FOUND_TITLE,
            "error searching for preference services"
          )
        )
    )
    .map(
      e.fromOption(ResponseErrorNotFound(NOT_FOUND_TITLE, "missing preference"))
    )
    .chain(te.fromEither);

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
      _ => new Error("Handler not feasible!")
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
