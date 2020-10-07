/* tslint:disable:no-any */
/* tslint:disable:no-duplicate-string */
/* tslint:disable:no-big-function */
/* tslint:disable: no-identical-functions */

import {
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";

import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";
import {
  EmailString,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";

import { MaxAllowedPaymentAmount } from "io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";

import { left, right } from "fp-ts/lib/Either";
import * as reporters from "italia-ts-commons/lib/reporters";
import { Subscription } from "../../generated/api-admin/Subscription";
import { ServicePayload } from "../../generated/definitions/ServicePayload";
import { CreateServiceHandler } from "../handler";

const mockContext = {
  // tslint:disable: no-console
  log: {
    error: console.error,
    info: console.log
  }
} as any;

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;
const anEmail = "test@example.com" as EmailString;

const aServiceId = "s123" as NonEmptyString;

const aServicePayload: ServicePayload = {
  authorized_cidrs: [],
  department_name: "IT" as NonEmptyString,
  organization_fiscal_code: anOrganizationFiscalCode,
  organization_name: "AgID" as NonEmptyString,
  service_name: "Test" as NonEmptyString
};

const aService = {
  authorizedCIDRs: new Set([]),
  authorizedRecipients: new Set([]),
  departmentName: "IT" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: 0 as MaxAllowedPaymentAmount,
  organizationFiscalCode: anOrganizationFiscalCode,
  organizationName: "AgID" as NonEmptyString,
  requireSecureChannels: false,
  serviceId: aServiceId,
  serviceName: "Test" as NonEmptyString,
  version: 1 as NonNegativeInteger
};

const someSubscriptionKeys = {
  primary_key: "primary_key",
  secondary_key: "secondary_key"
};

const aSubscription: Subscription = {
  id: aServiceId,
  ...someSubscriptionKeys,
  scope: "NATIONAL"
};

const someUserAttributes: IAzureUserAttributes = {
  email: anEmail,
  kind: "IAzureUserAttributes",
  service: aService
};

const aUserAuthenticationDeveloper: IAzureApiAuthorization = {
  groups: new Set([UserGroup.ApiServiceRead, UserGroup.ApiServiceWrite]),
  kind: "IAzureApiAuthorization",
  subscriptionId: aServiceId,
  userId: "u123" as NonEmptyString
};

const mockUlidGenerator = jest.fn(() => aServiceId);

const productName = "IO_API_SERVICES" as NonEmptyString;
const sandboxFiscalCode = "BBBCCC00A11B123X" as NonEmptyString;

describe("CreateServiceHandler", () => {
  it("should respond with a created service with subscriptionKeys by providing a servicePayload", async () => {
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      )
    };

    const createServiceHandler = CreateServiceHandler(
      apiClientMock as any,
      mockUlidGenerator as any,
      productName,
      sandboxFiscalCode
    );
    const result = await createServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServicePayload
    );

    expect(apiClientMock.createSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.createService).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        ...aService,
        ...someSubscriptionKeys
      });
    }
  });

  it("should respond with an internal error if createSubscription does not respond", async () => {
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() => Promise.reject(new Error("Timeout")))
    };

    const createServiceHandler = CreateServiceHandler(
      apiClientMock as any,
      mockUlidGenerator as any,
      productName,
      sandboxFiscalCode
    );
    const result = await createServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServicePayload
    );

    expect(apiClientMock.createSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.createService).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if createSubscription returns Errors", async () => {
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      )
    };

    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);

    const createServiceHandler = CreateServiceHandler(
      apiClientMock as any,
      mockUlidGenerator as any,
      productName,
      sandboxFiscalCode
    );
    const result = await createServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServicePayload
    );

    expect(apiClientMock.createSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.createService).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if createSubscription returns Bad Request", async () => {
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() => Promise.resolve(right({ status: 400 })))
    };

    const createServiceHandler = CreateServiceHandler(
      apiClientMock as any,
      mockUlidGenerator as any,
      productName,
      sandboxFiscalCode
    );
    const result = await createServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServicePayload
    );

    expect(apiClientMock.createSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.createService).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with a Forbidden error if createSubscription returns Forbidden", async () => {
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() => Promise.resolve(right({ status: 403 })))
    };

    const createServiceHandler = CreateServiceHandler(
      apiClientMock as any,
      mockUlidGenerator as any,
      productName,
      sandboxFiscalCode
    );
    const result = await createServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServicePayload
    );

    expect(apiClientMock.createSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.createService).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with a Not found error if createSubscription returns Not found", async () => {
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() => Promise.resolve(right({ status: 404 })))
    };

    const createServiceHandler = CreateServiceHandler(
      apiClientMock as any,
      mockUlidGenerator as any,
      productName,
      sandboxFiscalCode
    );
    const result = await createServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServicePayload
    );

    expect(apiClientMock.createSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.createService).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseErrorNotFound");
    if (result.kind === "IResponseErrorNotFound") {
      expect(result.detail).toEqual("Not found: Resource not found");
    }
  });

  it("should respond with an internal error if createService does not respond", async () => {
    const apiClientMock = {
      createService: jest.fn(() => Promise.reject(new Error("Timeout"))),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      )
    };

    const createServiceHandler = CreateServiceHandler(
      apiClientMock as any,
      mockUlidGenerator as any,
      productName,
      sandboxFiscalCode
    );
    const result = await createServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServicePayload
    );

    expect(apiClientMock.createSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.createService).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if createService returns Errors", async () => {
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      ),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      )
    };

    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);

    const createServiceHandler = CreateServiceHandler(
      apiClientMock as any,
      mockUlidGenerator as any,
      productName,
      sandboxFiscalCode
    );
    const result = await createServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServicePayload
    );

    expect(apiClientMock.createSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.createService).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with Unauthorized if createService returns Unauthorized", async () => {
    const apiClientMock = {
      createService: jest.fn(() => Promise.resolve(right({ status: 401 }))),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      )
    };

    const createServiceHandler = CreateServiceHandler(
      apiClientMock as any,
      mockUlidGenerator as any,
      productName,
      sandboxFiscalCode
    );
    const result = await createServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServicePayload
    );

    expect(apiClientMock.createSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.createService).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorUnauthorized");
    if (result.kind === "IResponseErrorUnauthorized") {
      expect(result.detail).toEqual("Unauthorized: Unauthorized");
    }
  });
});
