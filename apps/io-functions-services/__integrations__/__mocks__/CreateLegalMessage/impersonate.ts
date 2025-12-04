import { ImpersonatedService } from "@pagopa/io-functions-admin-sdk/ImpersonatedService";
import { ResponseErrorInternal } from "@pagopa/ts-commons/lib/responses";
import { ResponseErrorNotFound } from "@pagopa/ts-commons/lib/responses";
import * as TE from "fp-ts/lib/TaskEither";

import { APIClient } from "../clients/admin";
import { ILogger } from "../utils/logging";
import { ErrorResponses } from "../utils/responses";

export const getImpersonatedService = (
  _: ILogger,
  __: APIClient,
  serviceId: string
): TE.TaskEither<ErrorResponses, ImpersonatedService> => {
  switch (serviceId) {
    case "aNotExistingServiceId":
      return TE.left(
        ResponseErrorNotFound("Not Found", "Service Id not found")
      );
    case "aRaiseImpersonateErrorServiceId":
      return TE.left(
        ResponseErrorInternal("Cannot retrieve impersonated service detail")
      );
    case "aValidServiceId":
      return TE.of({
        service_id: "aValidServiceId",
        user_email: "test@legal.it",
        user_groups: "ApiMessageWrite"
      });
    case "aValidServiceWithoutWriteMessageGroupsId":
      return TE.of({
        service_id: "aValidServiceWithoutWriteMessageGroupsId",
        user_email: "demo@legal.it",
        user_groups: "ApiMessageRead"
      });
  }
};
