/* eslint-disable @typescript-eslint/no-explicit-any */

import { Logo } from "@pagopa/io-functions-admin-sdk/Logo";
import { SubscriptionWithoutKeys } from "@pagopa/io-functions-admin-sdk/SubscriptionWithoutKeys";
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

import { UploadServiceLogoHandler } from "../handler";

const mockContext = {
  // eslint-disable no-console
  log: {
    error: console.error
  }
} as any;

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;
const anEmail = "test@example.com" as EmailString;

const aServiceId = "s123" as NonEmptyString;
const aManageSubscriptionId = "MANAGE-123" as NonEmptyString;
const aUserId = "u123" as NonEmptyString;
const aDifferentUserId = "u456" as NonEmptyString;
const someSubscriptionKeys = {
  primary_key: "primary_key",
  secondary_key: "secondary_key"
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
  scope: "NATIONAL",
  serviceId: aServiceId,
  serviceName: "Test" as NonEmptyString,
  version: 1 as NonNegativeInteger,
  ...someSubscriptionKeys
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
  userId: aUserId
};

const aUserAuthenticationDeveloperWithManageKey: IAzureApiAuthorization = {
  ...aUserAuthenticationDeveloper,
  subscriptionId: aManageSubscriptionId
};

const aDifferentUserAuthenticationDeveloperWithManageKey: IAzureApiAuthorization =
  {
    ...aUserAuthenticationDeveloperWithManageKey,
    userId: aDifferentUserId
  };

const aLogoPayload: Logo = {
  logo: "base64-logo-img" as NonEmptyString
};

const aRetrievedServiceSubscription: SubscriptionWithoutKeys = {
  id: aServiceId,
  owner_id: aUserId,
  scope: "aScope"
};

const aRetrievedServiceSubscriptionWithoutOwnerId: SubscriptionWithoutKeys = {
  id: aServiceId,
  scope: "aScope"
};

// eslint-disable-next-line max-lines-per-function
describe("UploadServiceLogoHandler", () => {
  it("should respond with 200 if logo upload was successfull", async () => {
    const apiClientMock = {
      getSubscription: vi.fn(() =>
        Promise.resolve(
          right({ status: 200, value: aRetrievedServiceSubscription })
        )
      ),
      uploadServiceLogo: vi.fn(() => Promise.resolve(right({ status: 201 })))
    };

    const uploadServiceLogoHandler = UploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await uploadServiceLogoHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aLogoPayload
    );

    expect(apiClientMock.uploadServiceLogo).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscription).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toBeUndefined();
    }
  });

  it("should respond with an Unauthorized error if service is no owned by current user", async () => {
    const apiClientMock = {
      getSubscription: vi.fn(() =>
        Promise.resolve(
          right({ status: 200, value: aRetrievedServiceSubscription })
        )
      ),
      uploadServiceLogo: vi.fn(() => Promise.resolve(right({ status: 201 })))
    };

    const uploadServiceLogoHandler = UploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await uploadServiceLogoHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      "aServiceId" as NonEmptyString,
      aLogoPayload
    );

    expect(apiClientMock.getSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.uploadServiceLogo).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with an internal error if upload service logo does not respond", async () => {
    const apiClientMock = {
      getSubscription: vi.fn(() =>
        Promise.resolve(
          right({ status: 200, value: aRetrievedServiceSubscription })
        )
      ),
      uploadServiceLogo: vi.fn(() => Promise.reject(new Error("Timeout")))
    };

    const uploadServiceLogoHandler = UploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await uploadServiceLogoHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aLogoPayload
    );

    expect(apiClientMock.getSubscription).not.toHaveBeenCalled();
    expect(apiClientMock.uploadServiceLogo).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if uploadServiceLogo returns Errors", async () => {
    const apiClientMock = {
      getSubscription: vi.fn(() =>
        Promise.resolve(
          right({ status: 200, value: aRetrievedServiceSubscription })
        )
      ),
      uploadServiceLogo: vi.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      )
    };

    vi.spyOn(reporters, "errorsToReadableMessages").mockImplementation(() => [
      "ValidationErrors"
    ]);

    const uploadServiceLogoHandler = UploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await uploadServiceLogoHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aLogoPayload
    );

    expect(apiClientMock.getSubscription).not.toHaveBeenCalled();
    expect(apiClientMock.uploadServiceLogo).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with Not found if no service was found", async () => {
    const apiClientMock = {
      uploadServiceLogo: vi.fn(() => Promise.resolve(right({ status: 404 })))
    };

    const uploadServiceLogoHandler = UploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await uploadServiceLogoHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aLogoPayload
    );

    expect(apiClientMock.uploadServiceLogo).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorNotFound");
    if (result.kind === "IResponseErrorNotFound") {
      expect(result.detail).toEqual("Not found: Resource not found");
    }
  });

  it("should respond with forbidden if getUser returns Forbidden", async () => {
    const apiClientMock = {
      uploadServiceLogo: vi.fn(() => Promise.resolve(right({ status: 403 })))
    };

    const uploadServiceLogoHandler = UploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await uploadServiceLogoHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aLogoPayload
    );

    expect(apiClientMock.uploadServiceLogo).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  // MANAGE Flow Tests -->
  it("should respond with 200 if logo upload was successfull, using a MANAGE API Key", async () => {
    const apiClientMock = {
      getSubscription: vi.fn(() =>
        Promise.resolve(
          right({ status: 200, value: aRetrievedServiceSubscription })
        )
      ),
      uploadServiceLogo: vi.fn(() => Promise.resolve(right({ status: 201 })))
    };

    const uploadServiceLogoHandler = UploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await uploadServiceLogoHandler(
      mockContext,
      aUserAuthenticationDeveloperWithManageKey,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aLogoPayload
    );

    expect(apiClientMock.uploadServiceLogo).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscription).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toBeUndefined();
    }
  });

  it("should respond with an Unauthorized error if MANAGE API Key has a different ownerId", async () => {
    const apiClientMock = {
      getSubscription: vi.fn(() =>
        Promise.resolve(
          right({ status: 200, value: aRetrievedServiceSubscription })
        )
      ),
      uploadServiceLogo: vi.fn(() => Promise.resolve(right({ status: 201 })))
    };

    const uploadServiceLogoHandler = UploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await uploadServiceLogoHandler(
      mockContext,
      aDifferentUserAuthenticationDeveloperWithManageKey,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aLogoPayload
    );

    expect(apiClientMock.getSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.uploadServiceLogo).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with an Unauthorized error if GetSubscription of a serviceId doesn't return an ownerId", async () => {
    const apiClientMock = {
      getSubscription: vi.fn(() =>
        Promise.resolve(
          right({
            status: 200,
            value: aRetrievedServiceSubscriptionWithoutOwnerId
          })
        )
      ),
      uploadServiceLogo: vi.fn(() => Promise.resolve(right({ status: 201 })))
    };

    const uploadServiceLogoHandler = UploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await uploadServiceLogoHandler(
      mockContext,
      aDifferentUserAuthenticationDeveloperWithManageKey,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aLogoPayload
    );

    expect(apiClientMock.getSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.uploadServiceLogo).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with an NotFound error if execute a GetSubscription of a not existing serviceId", async () => {
    const apiClientMock = {
      getSubscription: vi.fn(() =>
        Promise.resolve(
          right({
            status: 404,
            value: {
              error: {
                code: "ResourceNotFound",
                details: null,
                message: "Subscription not found."
              }
            }
          })
        )
      ),
      uploadServiceLogo: vi.fn(() => Promise.resolve(right({ status: 201 })))
    };

    const uploadServiceLogoHandler = UploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await uploadServiceLogoHandler(
      mockContext,
      aUserAuthenticationDeveloperWithManageKey,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aLogoPayload
    );

    expect(apiClientMock.getSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.uploadServiceLogo).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorNotFound");
  });

  it("should respond with an Error GetSubscription returns an error", async () => {
    const apiClientMock = {
      getSubscription: vi.fn(() =>
        Promise.reject(new Error("Internal Server Error"))
      ),
      uploadServiceLogo: vi.fn(() => Promise.resolve(right({ status: 201 })))
    };

    const uploadServiceLogoHandler = UploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await uploadServiceLogoHandler(
      mockContext,
      aUserAuthenticationDeveloperWithManageKey,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aLogoPayload
    );

    expect(apiClientMock.getSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.uploadServiceLogo).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorInternal");
  });
});
