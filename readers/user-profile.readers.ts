import { pipe } from "fp-ts/lib/function";

import * as TE from "fp-ts/TaskEither";
import * as RTE from "fp-ts/ReaderTaskEither";

import {
  Profile,
  ProfileModel
} from "@pagopa/io-functions-commons/dist/src/models/profile";

import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import {
  cosmosErrorsToString,
  InternalError,
  NotFoundError,
  toInternalError,
  toNotFoundError
} from "../utils/domain-errors";

// -----------------------------------------
// Interfaces
// -----------------------------------------

/**
 * It returns either a valid Profile or an Error.
 */
export type GetUserProfileReader = RTE.ReaderTaskEither<
  { readonly fiscalCode: FiscalCode },
  NotFoundError | InternalError,
  Profile
>;

// --------------------------------------------
// Implementations
// --------------------------------------------

export const getUserProfileReader = (
  profileModel: ProfileModel
): GetUserProfileReader => ({ fiscalCode }): ReturnType<GetUserProfileReader> =>
  pipe(
    profileModel.findLastVersionByModelId([fiscalCode]),
    TE.mapLeft(cosmosError =>
      toInternalError(
        `Error while retrieving user profile from Cosmos DB` as NonEmptyString,
        cosmosErrorsToString(cosmosError)
      )
    ),
    TE.chainW(
      TE.fromOption(() =>
        toNotFoundError(
          "User profile not found" as NonEmptyString,
          `User profile was not found for the given Fiscal Code` as NonEmptyString,
          "profile" as NonEmptyString
        )
      )
    )
  );
