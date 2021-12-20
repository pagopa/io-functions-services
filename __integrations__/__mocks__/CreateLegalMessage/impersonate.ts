import { ResponseErrorInternal } from "@pagopa/ts-commons/lib/responses";
import { ResponseErrorNotFound } from "@pagopa/ts-commons/lib/responses";
import * as TE from "fp-ts/lib/TaskEither";
import { APIClient } from "../clients/admin";
import { ImpersonatedService } from "../generated/api-admin/ImpersonatedService";
import { ILogger } from "../utils/logging";
import { ErrorResponses } from "../utils/responses";

export const getImpersonatedService = (
  _: ILogger,
  __: APIClient,
  serviceId: string
): TE.TaskEither<ErrorResponses, ImpersonatedService> => {
  switch (serviceId) {
    case "aValidServiceId":
      return TE.of({
        service_id: "aValidServiceId",
        user_groups: "ApiMessageWrite",
        user_email: "test@legal.it"
      });
    case "aValidServiceWithoutWriteMessageGroupsId":
      return TE.of({
        service_id: "aValidServiceWithoutWriteMessageGroupsId",
        user_groups: "ApiMessageRead",
        user_email: "demo@legal.it"
      });
    case "aNotExistingServiceId":
      return TE.left(
        ResponseErrorNotFound("Not Found", "Service Id not found")
      );
    case "aRaiseImpersonateErrorServiceId":
      return TE.left(
        ResponseErrorInternal("Cannot retrieve impersonated service detail")
      );
  }
};
