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
import { Logo } from "../../generated/api-admin/Logo";
import { UploadOrganizationLogoHandler } from "../handler";

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

describe("UploadOrganizationLogo", () => {
  it("should respond with 202 if logo upload was successfull", async () => {
    const apiClientMock = {
      uploadOrganizationLogo: jest.fn(() =>
        Promise.resolve(right({ status: 201 }))
      )
    };

    const uploadOrganizationLogoHandler = UploadOrganizationLogoHandler(
      apiClientMock as any
    );
    const result = await uploadOrganizationLogoHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      anOrganizationFiscalCode,
      aLogoPayload
    );

    expect(result.kind).toBe("IResponseSuccessAccepted");
    if (result.kind === "IResponseSuccessAccepted") {
      expect(result.detail).toBeUndefined();
    }
  });

  it("should respond with an internal error if upload service logo does not respond", async () => {
    const apiClientMock = {
      uploadOrganizationLogo: jest.fn(() =>
        Promise.reject(new Error("Timeout"))
      )
    };

    const uploadOrganizationLogoHandler = UploadOrganizationLogoHandler(
      apiClientMock as any
    );
    const result = await uploadOrganizationLogoHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      anOrganizationFiscalCode,
      aLogoPayload
    );

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if uploadOrganizationLogo returns Errors", async () => {
    const apiClientMock = {
      uploadOrganizationLogo: jest.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      )
    };

    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);

    const uploadOrganizationLogoHandler = UploadOrganizationLogoHandler(
      apiClientMock as any
    );
    const result = await uploadOrganizationLogoHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      anOrganizationFiscalCode,
      aLogoPayload
    );

    expect(result.kind).toBe("IResponseErrorInternal");
  });
});
