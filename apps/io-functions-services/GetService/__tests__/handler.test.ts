/* eslint-disable @typescript-eslint/no-explicit-any */

import { MaxAllowedPaymentAmount } from "@pagopa/io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";
import { toAuthorizedCIDRs } from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import * as reporters from "@pagopa/ts-commons/lib/reporters";
import {
  EmailString,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import { left, right } from "fp-ts/lib/Either";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mockContext } from "../../__mocks__/context.mock";
import { GetServiceHandler } from "../handler";
afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;
const anEmail = "test@example.com" as EmailString;

const aServiceId = "s123" as NonEmptyString;

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

// eslint-disable-next-line max-lines-per-function
describe("GetServiceHandler", () => {
  it("should respond with a service with subscriptionKeys if requesting user is the owner", async () => {
    const apiClientMock = {
      getService: vi.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      getSubscriptionKeys: vi.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      )
    };

    const getServiceHandler = GetServiceHandler(apiClientMock as any);
    const result = await getServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId
    );

    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        ...aService,
        ...someSubscriptionKeys
      });
    }
  });

  it("should respond with an unauthorized error if service is not owned by the user", async () => {
    const apiClientMock = {
      getService: vi.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      getSubscriptionKeys: vi.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      )
    };

    const getServiceHandler = GetServiceHandler(apiClientMock as any);
    const result = await getServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      "aServiceId" as NonEmptyString
    );

    expect(apiClientMock.getService).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with an internal error if getService does not respond", async () => {
    const apiClientMock = {
      getService: vi.fn(() => Promise.reject(new Error("Timeout"))),
      getSubscriptionKeys: vi.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      )
    };

    const getServiceHandler = GetServiceHandler(apiClientMock as any);
    const result = await getServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId
    );

    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if getService returns Errors", async () => {
    const apiClientMock = {
      getService: vi.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      ),
      getSubscriptionKeys: vi.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      )
    };

    vi.spyOn(reporters, "errorsToReadableMessages").mockImplementation(() => [
      "ValidationErrors"
    ]);

    const getServiceHandler = GetServiceHandler(apiClientMock as any);
    const result = await getServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId
    );

    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with Unauthorized if getService returns unauthorized", async () => {
    const apiClientMock = {
      getService: vi.fn(() => Promise.resolve(right({ status: 401 }))),
      getSubscriptionKeys: vi.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      )
    };

    const getServiceHandler = GetServiceHandler(apiClientMock as any);
    const result = await getServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId
    );

    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorUnauthorized");
    if (result.kind === "IResponseErrorUnauthorized") {
      expect(result.detail).toEqual("Unauthorized: Unauthorized");
    }
  });

  it("should respond with Not found if no service was found for the given serviceid", async () => {
    const apiClientMock = {
      getService: vi.fn(() => Promise.resolve(right({ status: 404 }))),
      getSubscriptionKeys: vi.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      )
    };

    const getServiceHandler = GetServiceHandler(apiClientMock as any);
    const result = await getServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId
    );

    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorNotFound");
    if (result.kind === "IResponseErrorNotFound") {
      expect(result.detail).toEqual("Not found: Resource not found");
    }
  });

  it("should respond with an internal error if getSubscriptionKeys does not respond", async () => {
    const apiClientMock = {
      getService: vi.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      getSubscriptionKeys: vi.fn(() => Promise.reject(new Error("Timeout")))
    };

    const getServiceHandler = GetServiceHandler(apiClientMock as any);
    const result = await getServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId
    );

    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if getSubscriptionKeys returns Errors", async () => {
    const apiClientMock = {
      getService: vi.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      getSubscriptionKeys: vi.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      )
    };

    vi.spyOn(reporters, "errorsToReadableMessages").mockImplementation(() => [
      "ValidationErrors"
    ]);

    const getServiceHandler = GetServiceHandler(apiClientMock as any);
    const result = await getServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId
    );

    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if getSubscriptionKeys returns Bad request", async () => {
    const apiClientMock = {
      getService: vi.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      getSubscriptionKeys: vi.fn(() => Promise.resolve(right({ status: 400 })))
    };

    const getServiceHandler = GetServiceHandler(apiClientMock as any);
    const result = await getServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId
    );

    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with forbidden if getSubscriptionKeys returns Forbidden", async () => {
    const apiClientMock = {
      getService: vi.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      getSubscriptionKeys: vi.fn(() => Promise.resolve(right({ status: 403 })))
    };

    const getServiceHandler = GetServiceHandler(apiClientMock as any);
    const result = await getServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId
    );

    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with Not found if no subscriptionKeys were found by the given serviceId", async () => {
    const apiClientMock = {
      getService: vi.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      getSubscriptionKeys: vi.fn(() => Promise.resolve(right({ status: 404 })))
    };

    const getServiceHandler = GetServiceHandler(apiClientMock as any);
    const result = await getServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId
    );

    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorNotFound");
  });
});
