import { fromPredicate } from "fp-ts/lib/TaskEither";
import { ResponseErrorForbiddenNotAuthorized } from "italia-ts-commons/lib/responses";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { ErrorResponses } from "./responses";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const serviceOwnerCheckTask = (
  serviceId: NonEmptyString,
  ownerSubscriptionId: NonEmptyString
) =>
  fromPredicate<ErrorResponses, NonEmptyString>(
    (svcId: NonEmptyString) => svcId === ownerSubscriptionId,
    _ => ResponseErrorForbiddenNotAuthorized
  )(serviceId);
