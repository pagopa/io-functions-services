import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";
import { Context } from "@azure/functions";
import { ImpersonateServiceHandler } from "../handler";
import { getLogger, ILogger } from "../../utils/logging";
import { ILegalMessageMapModel } from "../../utils/legal-message";
import { ServiceId } from "../../generated/api-admin/ServiceId";
import { EmailString, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { APIClient } from "../../clients/admin";
import {
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { getMockReq, getMockRes } from "@jest-mock/express";
import { ImpersonatedService } from "../../generated/api-admin/ImpersonatedService";

const VALID_SERVICE_ID = "valid-sid" as ServiceId;
const VALID_LEGAL_MAIL = "valid@pec.it" as EmailString;

// mock admin client
const VALID_IMPERSONATED_SERVICE: ImpersonatedService = {
  service_id: VALID_SERVICE_ID,
  user_groups: "dummyGroup1,dummyGroup2"
};
const impersonateServiceOk = TE.right({
  status: 200,
  value: VALID_IMPERSONATED_SERVICE
});
const impersonateService = jest.fn(impersonateServiceOk);
const adminClientMock = ({
  getImpersonatedService: impersonateService
} as unknown) as APIClient;
//

// mock logger
const contextMock = ({
  // eslint-disable no-console
  log: {
    error: console.error,
    info: console.log
  }
} as unknown) as Context;
const logger: ILogger = getLogger(contextMock, "testPrefix", "testName");
//

// mock legal message mapper
const findLastVersionByModelIdOk = email =>
  pipe(
    O.fromNullable({ "valid@pec.it": { serviceId: VALID_SERVICE_ID } }[email]),
    TE.right
  );
const findLastVersionByModelIdMock = jest.fn(findLastVersionByModelIdOk);
const legalMessageMapModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock
} as ILegalMessageMapModel;
//

describe("CreateServiceHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("GIVEN a valid legal mail mapped with a valid service WHEN the service is impersonated THEN the request contains the x-user-groups of the impersonated service  ", async () => {
    const PECSERVER_USER_GROUPS = "pec-group1";
    const reqMock = getMockReq({
      headers: {
        "x-user-groups": PECSERVER_USER_GROUPS
      }
    });

    const handler = ImpersonateServiceHandler(
      adminClientMock,
      legalMessageMapModelMock
    );
    const result = await handler(
      contextMock,
      undefined as any, // user auth not used
      reqMock,
      VALID_LEGAL_MAIL
    );

    expect(adminClientMock.getImpersonatedService).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        kind: "IResponseSuccessJson",
        value: VALID_IMPERSONATED_SERVICE
      })
    );
    expect(reqMock.headers).toEqual(
      expect.objectContaining({
        "x-user-groups": VALID_IMPERSONATED_SERVICE.user_groups
      })
    );
  });
});
