import { fromPredicate } from "fp-ts/lib/TaskEither";
import { ServiceMetadata } from "io-functions-commons/dist/src/models/service";
import {
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorValidation
} from "italia-ts-commons/lib/responses";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { ErrorResponses } from "./responses";

export const serviceOwnerCheckTask = (
  serviceId: NonEmptyString,
  ownerSubscriptionId: NonEmptyString
) =>
  fromPredicate<ErrorResponses, NonEmptyString>(
    (svcId: NonEmptyString) => svcId === ownerSubscriptionId,
    _ => ResponseErrorForbiddenNotAuthorized
  )(serviceId);

export const serviceVisibleMetadataCheckTask = (
  serviceMetadata: ServiceMetadata,
  isVisible: boolean
) =>
  fromPredicate<ErrorResponses, ServiceMetadata>(
    (svcMetadata: ServiceMetadata) =>
      isVisible === false || (isVisible === true && svcMetadata !== undefined),
    _ =>
      ResponseErrorValidation(
        "ValidationError",
        "Metadata required for visible service"
      )
  )(serviceMetadata);
