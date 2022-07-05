import { SpecialServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/SpecialServiceCategory";
import { RetrievedActivation } from "@pagopa/io-functions-commons/dist/src/models/activation";
import {
  Service,
  ServiceMetadata
} from "@pagopa/io-functions-commons/dist/src/models/service";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  IResponseErrorForbiddenNotAuthorized,
  ResponseErrorForbiddenNotAuthorized
} from "@pagopa/ts-commons/lib/responses";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { Second } from "@pagopa/ts-commons/lib/units";
import { ActivationStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ActivationStatus";
import { isBefore, subSeconds } from "date-fns";

/**
 * Return Unauthorized if the Service is not a SPECIAL service.
 *
 * @param service
 */
export const authorizedForSpecialServicesTask = (
  service: Service & {
    readonly version: NonNegativeInteger;
  }
): TE.TaskEither<IResponseErrorForbiddenNotAuthorized, ServiceMetadata> =>
  pipe(
    O.fromNullable(service.serviceMetadata),
    O.filter(
      serviceMetadata =>
        serviceMetadata.category === SpecialServiceCategoryEnum.SPECIAL
    ),
    TE.fromOption(() => ResponseErrorForbiddenNotAuthorized)
  );

/**
 * Configure a function with grace period that
 * returns true if:
 * - the Service Activation is present and ACTIVE
 * - the Service Activation is present and PENDING within the grace period
 *
 * @param pendingActivationGracePeriod PENDING grace period in seconds
 */
export const canSendMessageOnActivationWithGrace = (
  pendingActivationGracePeriod: Second
) => (maybeActivation: O.Option<RetrievedActivation>): boolean =>
  pipe(
    maybeActivation,
    O.map(
      activation =>
        activation.status === ActivationStatusEnum.ACTIVE ||
        (activation.status === ActivationStatusEnum.PENDING &&
          isBefore(
            subSeconds(new Date(), pendingActivationGracePeriod),
            // eslint-disable-next-line no-underscore-dangle
            activation._ts
          ))
    ),
    O.getOrElse(() => false)
  );
