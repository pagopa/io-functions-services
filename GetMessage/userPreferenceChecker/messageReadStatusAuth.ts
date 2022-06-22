import * as TE from "fp-ts/TaskEither";
import { pipe } from "fp-ts/function";

import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { userPreferencesCheckerFactory } from "./userPreferencesCheckerFactory";

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
export const canAccessMessageReadStatus: MessageReadStatusAuth = (
  serviceId,
  fiscalCode
) =>
  pipe(
    // Retrieve profile and service preferences
    // setup userPreferenceCheckerFactory
    userPreferencesCheckerFactory("UNKNOWN"),
    // return check result
    checker => checker.canAccessMessageReadStatus(serviceId, fiscalCode)
  );
