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
import { Logo } from "../../generated/api-admin/Logo";
import { GetUploadServiceLogoHandler } from "../handler";

const mockContext = {
  log: {
    // tslint:disable-next-line: no-console
    error: console.error,
    // tslint:disable-next-line: no-console
    info: console.log,
    // tslint:disable-next-line: no-console
    verbose: console.log,
    // tslint:disable-next-line: no-console
    warn: console.warn
  }
} as any;

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;
const anEmail = "test@example.com" as EmailString;

const aServiceId = "s123" as NonEmptyString;
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
  userId: "u123" as NonEmptyString
};

const aLogoPayload: Logo = {
  logo: "base64-logo-img" as NonEmptyString
};

describe("GetUploadServiceLogoHandler", () => {
  it("should respond with 200 if log upload was successfull", async () => {
    const apiClientMock = {
      uploadServiceLogo: jest.fn(() => Promise.resolve(right({ status: 201 })))
    };

    const getUploadServiceLogoHandler = GetUploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await getUploadServiceLogoHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aLogoPayload
    );

    expect(apiClientMock.uploadServiceLogo).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toBeUndefined();
    }
  });

  it("should respond with an internal error if upload service logo does not respond", async () => {
    const apiClientMock = {
      uploadServiceLogo: jest.fn(() => Promise.reject(new Error("Timeout")))
    };

    const getUploadServiceLogoHandler = GetUploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await getUploadServiceLogoHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aLogoPayload
    );

    expect(apiClientMock.uploadServiceLogo).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if uploadServiceLogo returns Errors", async () => {
    const apiClientMock = {
      uploadServiceLogo: jest.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      )
    };

    const getUploadServiceLogoHandler = GetUploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await getUploadServiceLogoHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aLogoPayload
    );

    expect(apiClientMock.uploadServiceLogo).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with Not found if no service was found", async () => {
    const apiClientMock = {
      uploadServiceLogo: jest.fn(() => Promise.resolve(right({ status: 404 })))
    };

    const getUploadServiceLogoHandler = GetUploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await getUploadServiceLogoHandler(
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
      uploadServiceLogo: jest.fn(() => Promise.resolve(right({ status: 403 })))
    };

    const getUploadServiceLogoHandler = GetUploadServiceLogoHandler(
      apiClientMock as any
    );
    const result = await getUploadServiceLogoHandler(
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
});
