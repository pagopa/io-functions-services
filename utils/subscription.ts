import { fromPredicate } from "fp-ts/lib/TaskEither";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { ErrorResponses, ResponseErrorUnauthorized } from "./responses";

export const serviceOwnerCheck = (
  serviceId: NonEmptyString,
  ownerSubscriptionId: NonEmptyString,
  msg: string
) =>
  fromPredicate<ErrorResponses, NonEmptyString>(
    (svcId: NonEmptyString) => svcId !== ownerSubscriptionId,
    _ => ResponseErrorUnauthorized("Unauthorized", msg)
  )(serviceId);
