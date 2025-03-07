import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  ServicesPreferencesModel,
  makeServicesPreferencesDocumentId
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import * as TE from "fp-ts/TaskEither";
import { identity, pipe } from "fp-ts/function";

import { ServicePreferencesGetter } from "./userPreferencesCheckerFactory";

export type GetProfileOrError = (
  fiscalCode: FiscalCode
) => TE.TaskEither<Error, RetrievedProfile>;

/**
 * Get last version of user's profile
 *
 * @param profileModel
 * @returns
 */
export const getProfile: (
  profileModel: ProfileModel
) => // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
GetProfileOrError = (profileModel) => (fiscalCode) =>
  pipe(
    profileModel.findLastVersionByModelId([fiscalCode]),
    TE.mapLeft(() => Error(`Error retrieving user profile from Cosmos DB`)),
    TE.chainOptionK(() => Error(`Profile not found`))(identity)
  );

/**
 * Get last version of user' service preferences, if exists
 *
 * @param servicePreferencesModel
 * @returns
 */
export const getServicePreferenceSettings: (
  servicePreferencesModel: ServicesPreferencesModel,
  servicePreferencesSettingsVersion: NonNegativeInteger | -1
) => ServicePreferencesGetter =
  (
    servicePreferencesModel,
    servicePreferencesSettingsVersion
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  ) =>
  (fiscalCode, serviceId) =>
    servicePreferencesSettingsVersion !== -1
      ? pipe(
          servicePreferencesModel.find([
            makeServicesPreferencesDocumentId(
              fiscalCode,
              serviceId,
              servicePreferencesSettingsVersion
            ),
            fiscalCode
          ]),
          TE.mapLeft(() =>
            Error(`Error retrieving user' service preferences from Cosmos DB`)
          )
        )
      : TE.left(Error("Legacy service preferences not allowed"));
