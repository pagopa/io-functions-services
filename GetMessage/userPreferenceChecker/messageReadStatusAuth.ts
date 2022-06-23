/* eslint-disable @typescript-eslint/no-use-before-define */
import * as TE from "fp-ts/TaskEither";
import { pipe } from "fp-ts/function";

import { FiscalCode, Semver } from "@pagopa/ts-commons/lib/strings";
import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import { ServicesPreferencesModel } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";

import {
  IUserPreferencesChecker,
  userPreferencesCheckerFactory
} from "./userPreferencesCheckerFactory";
import { getProfile, getServicePreferenceSettings } from "./cosmos.utils";

export type MessageReadStatusAuth = (
  serviceId: ServiceId,
  fiscalCode: FiscalCode
) => TE.TaskEither<Error, boolean>;

/**
 * Checks whether the client service can access user's message read status
 *
 * @param serviceId the subscription id of the service
 * @param fiscalCode the recipient's fiscalCode
 * @returns either false if user revoked the permission to access the read status, true otherwise
 * or an Error
 */
export const canAccessMessageReadStatus: (
  profileModel: ProfileModel,
  servicePreferencesModel: ServicesPreferencesModel,
  minAppVersionHandlingReadAuth: Semver
) => MessageReadStatusAuth = (
  profileModel,
  servicePreferencesModel,
  minAppVersionHandlingReadAuth
) =>
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  (serviceId, fiscalCode) =>
    pipe(
      // Retrieve profile
      fiscalCode,
      getProfile(profileModel),
      TE.map(
        setupUserPreferencesChecker(
          servicePreferencesModel,
          minAppVersionHandlingReadAuth
        )
      ),
      // return check result
      TE.chain(checker =>
        checker.canAccessMessageReadStatus(serviceId, fiscalCode)
      )
    );

// ---------------------

const setupUserPreferencesChecker = (
  servicePreferencesModel: ServicesPreferencesModel,
  minAppVersionHandlingReadAuth: Semver
) => (profile: RetrievedProfile): IUserPreferencesChecker =>
  userPreferencesCheckerFactory(
    profile,
    getServicePreferenceSettings(
      servicePreferencesModel,
      profile.servicePreferencesSettings.version
    ),
    minAppVersionHandlingReadAuth
  );
