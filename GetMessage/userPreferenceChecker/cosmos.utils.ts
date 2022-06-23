import * as TE from "fp-ts/TaskEither";
import { identity, pipe } from "fp-ts/function";

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";

import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";

import {
  AccessReadMessageStatusEnum,
  makeServicesPreferencesDocumentId,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";

import { ServicePreferencesGetter } from "./userPreferencesCheckerFactory";

export type GetProfileOrError = (
  fiscalCode: FiscalCode
) => TE.TaskEither<Error, RetrievedProfile>;

/**
 * Get last version of user's profile
 * @param profileModel
 * @returns
 */
export const getProfile: (
  profileModel: ProfileModel
) => // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
GetProfileOrError = profileModel => fiscalCode =>
  pipe(
    profileModel.findLastVersionByModelId([fiscalCode]),
    TE.mapLeft(_ => Error(`Error retrieving user profile from Cosmos DB`)),
    TE.chainOptionK(() => Error(`Profile not found`))(identity)
  );

export type GetAccessReadMessageStatusOrError = (
  fiscalCode: FiscalCode,
  serviceId: ServiceId
) => TE.TaskEither<Error, AccessReadMessageStatusEnum>;

/**
 * Get last version of user' service preference
 * @param servicePreferencesModel
 * @returns
 */
export const getServicePreferenceSettings: (
  servicePreferencesModel: ServicesPreferencesModel,
  profileVersion: NonNegativeInteger
) => // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
ServicePreferencesGetter = (servicePreferencesModel, profileVersion) => (
  fiscalCode,
  serviceId
) =>
  pipe(
    servicePreferencesModel.find([
      makeServicesPreferencesDocumentId(fiscalCode, serviceId, profileVersion),
      fiscalCode
    ]),
    TE.mapLeft(_ =>
      Error(`Error retrieving user' service preferences from Cosmos DB`)
    )
  );
