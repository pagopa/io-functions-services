import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import {
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import {
  IResponseErrorForbiddenNotAuthorizedForProduction,
  IResponseErrorForbiddenNotAuthorizedForRecipient,
  ResponseErrorForbiddenNotAuthorizedForProduction,
  ResponseErrorForbiddenNotAuthorizedForRecipient
} from "@pagopa/ts-commons/lib/responses";
import * as E from "fp-ts/lib/Either";
import { Either } from "fp-ts/lib/Either";

/**
 * Checks whether the client service can create a new message for the recipient
 */
export const canWriteMessage = (
  authGroups: IAzureApiAuthorization["groups"],
  authorizedRecipients: IAzureUserAttributes["service"]["authorizedRecipients"],
  fiscalCode: FiscalCode
): Either<
  | IResponseErrorForbiddenNotAuthorizedForProduction
  | IResponseErrorForbiddenNotAuthorizedForRecipient,
  true
> => {
  // check whether the user is authorized to send messages to limited recipients
  // or whether the user is authorized to send messages to any recipient
  if (authGroups.has(UserGroup.ApiLimitedMessageWrite)) {
    // user is in limited message creation mode, check whether he's sending
    // the message to an authorized recipient
    if (!authorizedRecipients.has(fiscalCode)) {
      return E.left(ResponseErrorForbiddenNotAuthorizedForRecipient);
    }
  } else if (!authGroups.has(UserGroup.ApiMessageWrite)) {
    // the user is doing a production call but he's not enabled
    return E.left(ResponseErrorForbiddenNotAuthorizedForProduction);
  }

  return E.right(true);
};
