import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";
import { Context } from "@azure/functions";
import { CreateLegalMessageHandler } from "../handler";
import { getLogger, ILogger } from "../../utils/logging";
import { ILegalMessageMapModel } from "../../utils/legal-message";
import { ServiceId } from "../../generated/api-admin/ServiceId";
import {
  EmailString,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import { APIClient } from "../../clients/admin";
import { UserGroup } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ImpersonatedService } from "../../generated/api-admin/ImpersonatedService";
import {
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import {
  Service,
  toAuthorizedCIDRs
} from "@pagopa/io-functions-commons/dist/src/models/service";
import { MaxAllowedPaymentAmount } from "@pagopa/io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";
import mockReq from "../../__mocks__/request";
import {
  aMessagePayload,
  aMessagePayloadWithLegalData
} from "../../__mocks__/mocks";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { withoutUndefinedValues } from "@pagopa/ts-commons/lib/types";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";

const VALID_SERVICE_ID = "valid-sid" as ServiceId;
const VALID_LEGAL_MAIL = "valid@pec.it" as EmailString;

// mock admin client
const VALID_IMPERSONATED_SERVICE: ImpersonatedService = {
  service_id: VALID_SERVICE_ID,
  user_groups: [
    UserGroup.ApiMessageWrite,
    UserGroup.ApiLimitedMessageWrite
  ].join(","),
  user_email: VALID_LEGAL_MAIL
};

const anInvalidMessagePayload = withoutUndefinedValues({
  ...aMessagePayload,
  content: {
    subject: undefined
  },
  time_to_live: undefined
});

const anImpersonatedServiceWithWrongUserGroups: ImpersonatedService = {
  service_id: VALID_SERVICE_ID,
  user_groups: UserGroup.ApiMessageRead,
  user_email: VALID_LEGAL_MAIL
};

const anImpersonatedServiceWithoutUserGroups: ImpersonatedService = {
  service_id: VALID_SERVICE_ID,
  user_groups: "",
  user_email: VALID_LEGAL_MAIL
};

const anImpersonatedServiceWithoutSubscriptionId: ImpersonatedService = {
  service_id: "",
  user_groups: [
    UserGroup.ApiMessageWrite,
    UserGroup.ApiLimitedMessageWrite
  ].join(","),
  user_email: VALID_LEGAL_MAIL
};
const impersonateServiceMock = jest.fn().mockImplementation(() =>
  TE.right({
    status: 200,
    value: VALID_IMPERSONATED_SERVICE
  })()
);
const adminClientMock = ({
  getImpersonatedService: impersonateServiceMock
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
const findLastVersionByModelIdOk = jest.fn(email =>
  pipe(
    O.fromNullable({ "valid@pec.it": { serviceId: VALID_SERVICE_ID } }[email]),
    TE.right
  )
);
const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(findLastVersionByModelIdOk);
const legalMessageMapModelMock = {
  findLastVersionByModelId: findLastVersionByModelIdMock
} as ILegalMessageMapModel;

const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;

const aService: Service = {
  authorizedCIDRs: toAuthorizedCIDRs([]),
  authorizedRecipients: new Set([]),
  departmentName: "MyDept" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: 0 as MaxAllowedPaymentAmount,
  organizationFiscalCode: anOrganizationFiscalCode,
  organizationName: "MyService" as NonEmptyString,
  requireSecureChannels: false,
  serviceId: "serviceId" as NonEmptyString,
  serviceName: "MyService" as NonEmptyString
};

const anIpString = "5.90.26.229";

const aCosmosError = toCosmosErrorResponse(new Error("Cosmos Error"));

const findServiceLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => TE.fromEither(E.right(O.some(aService))));
const anErrorFindServiceLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => TE.left(aCosmosError));

const anEmptyFindServiceLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => TE.right(O.none));
const serviceModel = {
  findLastVersionByModelId: findServiceLastVersionByModelIdMock
} as any;

const createMessageHandlerMock = jest.fn((_, __, ___, ____, _____, ______) =>
  Promise.resolve(ResponseSuccessJson({ completed: true }))
) as any;

const dummyPecServerUserAttribute = {
  email: "dummy@pecserver.it",
  service: {
    serviceId: "dummyId"
  }
} as IAzureUserAttributes;

describe("CreateLegalMessageHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should enrich the request body legal data with pec-server service id ", async () => {
    const PECSERVER_USER_GROUPS = "pec-group1";
    const reqMock = mockReq();
    reqMock.setContext(contextMock);
    reqMock.setHeaders({
      "x-user-groups": PECSERVER_USER_GROUPS,
      "x-client-ip": anIpString,
      "x-user-id": "unused"
    });
    reqMock.body = aMessagePayloadWithLegalData;

    const handler = CreateLegalMessageHandler(
      adminClientMock,
      legalMessageMapModelMock,
      serviceModel,
      createMessageHandlerMock
    );
    await handler(
      contextMock,
      undefined as any, // user auth not used
      undefined as any,
      dummyPecServerUserAttribute,
      reqMock,
      VALID_LEGAL_MAIL,
      undefined as any
    );

    expect(reqMock.body.content.legal_data.pec_server_service_id).toEqual(
      dummyPecServerUserAttribute.service.serviceId
    );
  });

  it("should impersonate the service and override the request contains the x-user-groups of the impersonated service  ", async () => {
    const PECSERVER_USER_GROUPS = "pec-group1";
    const reqMock = mockReq();
    reqMock.setContext(contextMock);
    reqMock.setHeaders({
      "x-user-groups": PECSERVER_USER_GROUPS,
      "x-client-ip": anIpString,
      "x-user-id": "unused"
    });
    reqMock.body = aMessagePayload;

    const handler = CreateLegalMessageHandler(
      adminClientMock,
      legalMessageMapModelMock,
      serviceModel,
      createMessageHandlerMock
    );
    await handler(
      contextMock,
      undefined as any, // user auth not used
      undefined as any,
      dummyPecServerUserAttribute,
      reqMock,
      VALID_LEGAL_MAIL,
      undefined as any
    );

    expect(adminClientMock.getImpersonatedService).toHaveBeenCalledTimes(1);
    expect(reqMock.headers).toEqual(
      expect.objectContaining({
        "x-user-groups": VALID_IMPERSONATED_SERVICE.user_groups
      })
    );
  });

  it("should return Internal error if mailMapper fails to retrieve service", async () => {
    const reqMock = mockReq();
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.left(ResponseErrorInternal("Error"))
    );

    const handler = CreateLegalMessageHandler(
      adminClientMock,
      legalMessageMapModelMock,
      serviceModel,
      createMessageHandlerMock
    );
    const result = await handler(
      contextMock,
      undefined as any, // user auth not used
      undefined as any,
      dummyPecServerUserAttribute,
      reqMock,
      VALID_LEGAL_MAIL,
      undefined as any
    );

    expect(adminClientMock.getImpersonatedService).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        kind: "IResponseErrorInternal"
      })
    );
  });

  it("should return Not found error if mailMapper returns Not Found", async () => {
    const reqMock = mockReq();
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.left(ResponseErrorNotFound("Not Found", "Not Found"))
    );

    const handler = CreateLegalMessageHandler(
      adminClientMock,
      legalMessageMapModelMock,
      serviceModel,
      createMessageHandlerMock
    );
    const result = await handler(
      contextMock,
      undefined as any, // user auth not used
      undefined as any,
      dummyPecServerUserAttribute,
      reqMock,
      VALID_LEGAL_MAIL,
      undefined as any
    );

    expect(adminClientMock.getImpersonatedService).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        kind: "IResponseErrorNotFound"
      })
    );
  });

  it("should return Not found error if mailMapper returns none", async () => {
    const reqMock = mockReq();
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.of(O.none));

    const handler = CreateLegalMessageHandler(
      adminClientMock,
      legalMessageMapModelMock,
      serviceModel,
      createMessageHandlerMock
    );
    const result = await handler(
      contextMock,
      undefined as any, // user auth not used
      undefined as any,
      dummyPecServerUserAttribute,
      reqMock,
      VALID_LEGAL_MAIL,
      undefined as any
    );

    expect(adminClientMock.getImpersonatedService).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        kind: "IResponseErrorNotFound"
      })
    );
  });

  it.each`
    error                  | impersonateReturnValue | expectedReturnValue
    ${"Internal"}          | ${{ status: 500 }}     | ${"IResponseErrorInternal"}
    ${"Not Found"}         | ${{ status: 404 }}     | ${"IResponseErrorNotFound"}
    ${"Unauthorized"}      | ${{ status: 401 }}     | ${"IResponseErrorUnauthorized"}
    ${"Forbidden"}         | ${{ status: 403 }}     | ${"IResponseErrorForbiddenNotAuthorized"}
    ${"Too many requests"} | ${{ status: 429 }}     | ${"IResponseErrorTooManyRequests"}
  `(
    "should return $error error if getImpersonatedService returns $error error",
    async ({ impersonateReturnValue, expectedReturnValue }) => {
      const reqMock = mockReq();
      impersonateServiceMock.mockImplementationOnce(() =>
        TE.right(impersonateReturnValue)()
      );
      const handler = CreateLegalMessageHandler(
        adminClientMock,
        legalMessageMapModelMock,
        serviceModel,
        createMessageHandlerMock
      );
      const result = await handler(
        contextMock,
        undefined as any, // user auth not used
        undefined as any,
        dummyPecServerUserAttribute,
        reqMock,
        VALID_LEGAL_MAIL,
        undefined as any
      );

      expect(adminClientMock.getImpersonatedService).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          kind: expectedReturnValue
        })
      );
    }
  );

  it.each`
    middleware                         | impersonatedService                           | findServiceLastVersionByModelIdMockImpl       | messagePayload             | expectedReturnValue
    ${"AzureApiAuthMiddleware"}        | ${anImpersonatedServiceWithoutUserGroups}     | ${findServiceLastVersionByModelIdMock}        | ${aMessagePayload}         | ${"IResponseErrorForbiddenNoAuthorizationGroups"}
    ${"AzureApiAuthMiddleware"}        | ${anImpersonatedServiceWithoutSubscriptionId} | ${findServiceLastVersionByModelIdMock}        | ${aMessagePayload}         | ${"IResponseErrorForbiddenAnonymousUser"}
    ${"AzureApiAuthMiddleware"}        | ${anImpersonatedServiceWithWrongUserGroups}   | ${findServiceLastVersionByModelIdMock}        | ${aMessagePayload}         | ${"IResponseErrorForbiddenNotAuthorized"}
    ${"AzureUserAttributesMiddleware"} | ${VALID_IMPERSONATED_SERVICE}                 | ${anErrorFindServiceLastVersionByModelIdMock} | ${aMessagePayload}         | ${"IResponseErrorQuery"}
    ${"AzureUserAttributesMiddleware"} | ${VALID_IMPERSONATED_SERVICE}                 | ${anEmptyFindServiceLastVersionByModelIdMock} | ${aMessagePayload}         | ${"IResponseErrorForbiddenNotAuthorized"}
    ${"MessagePayloadMiddleware"}      | ${VALID_IMPERSONATED_SERVICE}                 | ${findServiceLastVersionByModelIdMock}        | ${anInvalidMessagePayload} | ${"IResponseErrorValidation"}
  `(
    "should return $expectedReturnValue when CreateMessage's $middleware returns $expectedReturnValue",
    async ({
      impersonatedService,
      findServiceLastVersionByModelIdMockImpl,
      messagePayload,
      expectedReturnValue
    }) => {
      const PECSERVER_USER_GROUPS = "pec-group1";
      const reqMock = mockReq();
      reqMock.setContext(contextMock);
      reqMock.setHeaders({
        "x-user-groups": PECSERVER_USER_GROUPS,
        "x-client-ip": anIpString,
        "x-user-id": "unused"
      });
      reqMock.body = messagePayload;
      impersonateServiceMock.mockImplementationOnce(() =>
        TE.right({ status: 200, value: impersonatedService })()
      );
      findServiceLastVersionByModelIdMock.mockImplementationOnce(
        findServiceLastVersionByModelIdMockImpl
      );

      const handler = CreateLegalMessageHandler(
        adminClientMock,
        legalMessageMapModelMock,
        serviceModel,
        createMessageHandlerMock
      );
      const result = await handler(
        contextMock,
        undefined as any, // user auth not used
        undefined as any,
        dummyPecServerUserAttribute,
        reqMock,
        VALID_LEGAL_MAIL,
        undefined as any
      );

      expect(adminClientMock.getImpersonatedService).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          kind: expectedReturnValue
        })
      );
    }
  );
});
