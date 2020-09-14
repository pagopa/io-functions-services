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

import { toAuthorizedCIDRs } from "io-functions-commons/dist/src/models/service";

import { MaxAllowedPaymentAmount } from "io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";

import { left, right } from "fp-ts/lib/Either";
import * as reporters from "italia-ts-commons/lib/reporters";
import { Subscription } from "../../generated/api-admin/Subscription";
import { ServicePayload } from "../../generated/definitions/ServicePayload";
import { UpdateServiceHandler } from "../handler";

const mockContext = {
  // tslint:disable-next-line: no-console
  log: console.log
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
  authorizedCIDRs: toAuthorizedCIDRs([]),
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

describe("UpdateServiceHandler", () => {
  it("should respond with an updated service with subscriptionKeys by providing a servicePayload", async () => {
    const apiClientMock = {
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        ...aService,
        ...someSubscriptionKeys
      });
    }
  });

  it("should respond with an Unauthorized error if service is not owned by current user", async () => {
    const apiClientMock = {
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      "aServiceId" as NonEmptyString,
      aServicePayload
    );

    expect(apiClientMock.updateService).not.toHaveBeenCalled();
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseErrorUnauthorized");
    if (result.kind === "IResponseErrorUnauthorized") {
      expect(result.detail).toEqual(
        "Unauthorized: You are not allowed to update this service"
      );
    }
  });

  it("should respond with an internal error if updateService does not respond", async () => {
    const apiClientMock = {
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      updateService: jest.fn(() => Promise.reject(new Error("Timeout")))
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if updateService returns Errors", async () => {
    const apiClientMock = {
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      )
    };

    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with Unauthorized error if updateService returns Unauthorized", async () => {
    const apiClientMock = {
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      updateService: jest.fn(() => Promise.resolve(right({ status: 401 })))
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseErrorUnauthorized");
    if (result.kind === "IResponseErrorUnauthorized") {
      expect(result.detail).toEqual("Unauthorized: Unauthorized");
    }
  });

  it("should respond with Not Found if no service was found", async () => {
    const apiClientMock = {
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      updateService: jest.fn(() => Promise.resolve(right({ status: 404 })))
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseErrorNotFound");
    if (result.kind === "IResponseErrorNotFound") {
      expect(result.detail).toEqual("Not found: Resource not found");
    }
  });

  it("should respond with an internal error if getSubscriptionKeys does not respond", async () => {
    const apiClientMock = {
      getSubscriptionKeys: jest.fn(() => Promise.reject(new Error("Timeout"))),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if getSubscriptionKeys returns Errors", async () => {
    const apiClientMock = {
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };
    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if getSubscriptionKeys returns Bad request", async () => {
    const apiClientMock = {
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 400 }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with forbidden if getSubscriptionKeys returns Forbidden", async () => {
    const apiClientMock = {
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 403 }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with Not found if no subscriptionKeys were found by the given serviceId", async () => {
    const apiClientMock = {
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 404 }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorNotFound");
  });
});
