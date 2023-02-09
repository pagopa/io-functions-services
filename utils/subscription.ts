import { fromPredicate, TaskEither } from "fp-ts/lib/TaskEither";
import * as TE from "fp-ts/lib/TaskEither";
import { ResponseErrorForbiddenNotAuthorized } from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { SubscriptionWithoutKeys } from "@pagopa/io-functions-admin-sdk/SubscriptionWithoutKeys";
import { pipe } from "fp-ts/lib/function";
import { APIClient } from "../clients/admin";
import { ErrorResponses } from "./responses";
import { ILogger } from "./logging";
import { withApiRequestWrapper } from "./api";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const serviceOwnerCheckTask = (
  serviceId: NonEmptyString,
  ownerSubscriptionId: NonEmptyString
) =>
  fromPredicate<ErrorResponses, NonEmptyString>(
    (svcId: NonEmptyString) => svcId === ownerSubscriptionId,
    _ => ResponseErrorForbiddenNotAuthorized
  )(serviceId);

export const getSubscription = (
  logger: ILogger,
  apiClient: APIClient,
  subscriptionId: NonEmptyString
): TaskEither<ErrorResponses, SubscriptionWithoutKeys> =>
  withApiRequestWrapper(
    logger,
    () => apiClient.getSubscription({ subscriptionId }),
    200
  );

export const serviceOwnerCheckManageTask = (
  logger: ILogger,
  apiClient: APIClient,
  serviceId: NonEmptyString,
  ownerSubscriptionId: NonEmptyString,
  userId: NonEmptyString
): TaskEither<ErrorResponses, NonEmptyString> =>
  pipe(
    getSubscription(logger, apiClient, serviceId),
    TE.chain(serviceSubscription =>
      ownerSubscriptionId.startsWith("MANAGE-")
        ? serviceSubscription.owner_id === userId
          ? TE.of(serviceId)
          : TE.left(ResponseErrorForbiddenNotAuthorized)
        : TE.left(ResponseErrorForbiddenNotAuthorized)
    )
  );
