import * as TE from "fp-ts/lib/TaskEither";
import { ImpersonatedService } from "@pagopa/io-functions-admin-sdk/ImpersonatedService";
import { APIClient } from "../clients/admin";
import { withApiRequestWrapper } from "../utils/api";
import { ILogger } from "../utils/logging";
import { ErrorResponses } from "../utils/responses";

export const getImpersonatedService = (
  logger: ILogger,
  adminClient: APIClient,
  serviceId: string
): TE.TaskEither<ErrorResponses, ImpersonatedService> =>
  withApiRequestWrapper(
    logger,
    () =>
      adminClient.getImpersonatedService({
        serviceId
      }),
    200
  );
