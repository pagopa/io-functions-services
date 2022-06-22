import * as TE from "fp-ts/TaskEither";
import * as E from "fp-ts/Either";

import * as t from "io-ts";

import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { Profile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import { pipe } from "fp-ts/lib/function";

/**
 * An interface that describes all the checks over user' service prefereces
 */
export interface IUserPreferencesChecker {
  // Check if the service has the permissions to know the citizen's reading status
  readonly canAccessMessageReadStatus: (
    serviceId: ServiceId,
    fiscalCode: FiscalCode
  ) => TE.TaskEither<Error, boolean>;
}

/**
 * User Preference Checker, in case app version is unknown
 */
export const userPreferenceCheckerVersionUNKNOWN: IUserPreferencesChecker = {
  canAccessMessageReadStatus: (_serviceId, _fiscalCode) => TE.of(false)
};

/**
 * User Preference Checker, in case app version the one that introduced Read status preference
 */
export const userPreferenceCheckerVersionWithReadStatusPreferences: IUserPreferencesChecker = {
  canAccessMessageReadStatus: (_serviceId, _fiscalCode) =>
    TE.left(Error("Not implemented"))
};

/**
 * It return the right UserPreferenceChecker, based on user's appVersion
 */
export type UserPreferenceCheckerFactory = (
  appVersion: typeof Profile["_A"]["lastAppVersion"]
) => IUserPreferencesChecker;

export const userPreferencesCheckerFactory: UserPreferenceCheckerFactory = appVersion =>
  pipe(appVersion, v =>
    E.isRight(t.literal("UNKNOWN").decode(v))
      ? userPreferenceCheckerVersionUNKNOWN
      : userPreferenceCheckerVersionWithReadStatusPreferences
  );
