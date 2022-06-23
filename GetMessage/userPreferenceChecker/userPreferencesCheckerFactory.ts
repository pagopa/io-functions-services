/* eslint-disable @typescript-eslint/no-use-before-define */
import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";
import { identity, pipe } from "fp-ts/lib/function";

import * as t from "io-ts";

import * as semver from "semver";

import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { RetrievedProfile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  AccessReadMessageStatusEnum,
  ServicePreference
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { Semver } from "@pagopa/ts-commons/lib/strings";

/**
 * An interface that describes all the checks over user' service prefereces
 */

/**
 * It return the right UserPreferenceChecker, based on user's appVersion
 */
export type UserPreferenceCheckerFactory = (
  profile: RetrievedProfile,
  servicePreferencesGetter: ServicePreferencesGetter,
  minReadStatusPreferencesVersion: Semver
) => IUserPreferencesChecker;

export const userPreferencesCheckerFactory: UserPreferenceCheckerFactory = (
  profile,
  servicePreferencesGetter,
  minAppVersionHandlingReadAuth
) =>
  pipe(profile.lastAppVersion ?? "UNKNOWN", v =>
    t.literal("UNKNOWN").is(v) ||
    !appVersionHandleReadAuth(minAppVersionHandlingReadAuth)(v)
      ? userPreferenceCheckerVersionUNKNOWNToVersionWithReadAuth
      : userPreferenceCheckerVersionWithReadAuth(servicePreferencesGetter)
  );

export type ServicePreferencesGetter = (
  fiscalCode: FiscalCode,
  serviceId: ServiceId
) => TE.TaskEither<Error, O.Option<ServicePreference>>;

// ------------------------
// IUserPreferencesChecker implementation
// ------------------------

export interface IUserPreferencesChecker {
  // Check if the service has the permissions to know the citizen's reading status
  readonly canAccessMessageReadStatus: (
    serviceId: ServiceId,
    fiscalCode: FiscalCode
  ) => TE.TaskEither<Error, boolean>;
}

/**
 * User Preference Checker, in case app version is unknown or < the one in which read status preference has been introduced
 *
 * Always return false (authorization denied)
 */
export const userPreferenceCheckerVersionUNKNOWNToVersionWithReadAuth: IUserPreferencesChecker = {
  canAccessMessageReadStatus: (_serviceId, _fiscalCode) => TE.of(false)
};

/**
 * User Preference Checker, in case app version is >=the one in which read status preference has been introduced
 *
 * It return false (authorization denied) if service preference exists AND `accessReadMessageStatus` is set to "DENY"
 * It return true otherwise
 */
export const userPreferenceCheckerVersionWithReadAuth: (
  servicePreferencesGetter: ServicePreferencesGetter
) => IUserPreferencesChecker = servicePreferencesGetter => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  canAccessMessageReadStatus: (serviceId, fiscalCode) =>
    pipe(
      servicePreferencesGetter(fiscalCode, serviceId),
      TE.map(O.map(pref => pref.accessReadMessageStatus)),
      TE.map(O.fold(() => AccessReadMessageStatusEnum.ALLOW, identity)),
      TE.map(readStatus => readStatus !== AccessReadMessageStatusEnum.DENY)
    )
});

// ------------------------
// Private Methods
// ------------------------

const appVersionHandleReadAuth = (minAppVersionHandlingReadAuth: Semver) => (
  currentAppVersion: Semver
): boolean =>
  semver.satisfies(minAppVersionHandlingReadAuth, `<${currentAppVersion}`);
