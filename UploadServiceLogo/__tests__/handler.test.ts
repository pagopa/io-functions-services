/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonar/sonar-max-lines-per-function */
/* eslint-disable sonarjs/no-identical-functions */

import {
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  EmailString,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";

import { toAuthorizedCIDRs } from "@pagopa/io-functions-commons/dist/src/models/service";

import { MaxAllowedPaymentAmount } from "@pagopa/io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";

import { left, right } from "fp-ts/lib/Either";
import * as reporters from "@pagopa/ts-commons/lib/reporters";
import { Logo } from "@pagopa/io-functions-admin-sdk/Logo";
import { UploadServiceLogoHandler } from "../handler";

const mockContext = {
  // eslint-disable no-console
  log: {
    error: console.error
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

describe("UploadServiceLogoHandler", () => {
  it("should respond with 200 if log upload was successfull", async () => {
    const apiClientMock = {
      uploadServiceLogo: jest.fn(() => Promise.resolve(right({ status: 201 })))
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
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toBeUndefined();
    }
  });

  it("should respond with an Unauthorized error if service is no owned by current user", async () => {
    const apiClientMock = {
      uploadServiceLogo: jest.fn(() => Promise.resolve(right({ status: 201 })))
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

    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with an internal error if upload service logo does not respond", async () => {
    const apiClientMock = {
      uploadServiceLogo: jest.fn(() => Promise.reject(new Error("Timeout")))
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

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if uploadServiceLogo returns Errors", async () => {
    const apiClientMock = {
      uploadServiceLogo: jest.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      )
    };

    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);

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

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with Not found if no service was found", async () => {
    const apiClientMock = {
      uploadServiceLogo: jest.fn(() => Promise.resolve(right({ status: 404 })))
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
      uploadServiceLogo: jest.fn(() => Promise.resolve(right({ status: 403 })))
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
});
