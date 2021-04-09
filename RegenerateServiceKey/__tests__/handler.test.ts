/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonar/sonar-max-lines-per-function */
/* eslint-disable sonarjs/no-identical-functions */

import {
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";

import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";
import {
  EmailString,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";

import { toAuthorizedCIDRs } from "@pagopa/io-functions-commons/dist/src/models/service";

import { MaxAllowedPaymentAmount } from "@pagopa/io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";

import { left, right } from "fp-ts/lib/Either";
import * as reporters from "italia-ts-commons/lib/reporters";
import { SubscriptionKeyTypeEnum } from "../../generated/api-admin/SubscriptionKeyType";
import { SubscriptionKeyTypePayload } from "../../generated/api-admin/SubscriptionKeyTypePayload";
import { RegenerateServiceKeyHandler } from "../handler";

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
const regeneratedPrimarySubscriptionKeys = {
  primary_key: "regenerated_primary_key",
  secondary_key: "secondary_key"
};

const regeneratedSecondarySubscriptionKeys = {
  primary_key: "primary_key",
  secondary_key: "regenerated_secondary_key"
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

const aSubscriptionKeyTypePayload: SubscriptionKeyTypePayload = {
  key_type: SubscriptionKeyTypeEnum.PRIMARY_KEY
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

describe("RegenerateServiceKeyHandler", () => {
  it("should respond with a regenerated subscription primary key", async () => {
    const apiClientMock = {
      RegenerateSubscriptionKeys: jest.fn(() =>
        Promise.resolve(
          right({ status: 200, value: regeneratedPrimarySubscriptionKeys })
        )
      )
    };

    const regenerateServiceKeyHandler = RegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await regenerateServiceKeyHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aSubscriptionKeyTypePayload
    );

    expect(apiClientMock.RegenerateSubscriptionKeys).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual(regeneratedPrimarySubscriptionKeys);
    }
  });

  it("should respond with a regenerated subscription secondary key", async () => {
    const apiClientMock = {
      RegenerateSubscriptionKeys: jest.fn(() =>
        Promise.resolve(
          right({ status: 200, value: regeneratedSecondarySubscriptionKeys })
        )
      )
    };

    const regenerateServiceKeyHandler = RegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await regenerateServiceKeyHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      { key_type: SubscriptionKeyTypeEnum.SECONDARY_KEY }
    );

    expect(apiClientMock.RegenerateSubscriptionKeys).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual(regeneratedSecondarySubscriptionKeys);
    }
  });

  it("should respond with an Unauthorized error if service is no owned by current user", async () => {
    const apiClientMock = {
      RegenerateSubscriptionKeys: jest.fn(() =>
        Promise.resolve(
          right({ status: 200, value: regeneratedPrimarySubscriptionKeys })
        )
      )
    };

    const regenerateServiceKeyHandler = RegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await regenerateServiceKeyHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      "aServiceId" as NonEmptyString,
      { key_type: SubscriptionKeyTypeEnum.SECONDARY_KEY }
    );

    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with an internal error if RegenerateSubscriptionKeys does not respond", async () => {
    const apiClientMock = {
      RegenerateSubscriptionKeys: jest.fn(() =>
        Promise.reject(new Error("Timeout"))
      )
    };

    const regenerateServiceKeyHandler = RegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await regenerateServiceKeyHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aSubscriptionKeyTypePayload
    );

    expect(apiClientMock.RegenerateSubscriptionKeys).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if RegenerateSubscriptionKeys returns Errors", async () => {
    const apiClientMock = {
      RegenerateSubscriptionKeys: jest.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      )
    };

    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);

    const regenerateServiceKeyHandler = RegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await regenerateServiceKeyHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aSubscriptionKeyTypePayload
    );

    expect(apiClientMock.RegenerateSubscriptionKeys).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with Not found if no service was found", async () => {
    const apiClientMock = {
      RegenerateSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 404 }))
      )
    };

    const regenerateServiceKeyHandler = RegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await regenerateServiceKeyHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aSubscriptionKeyTypePayload
    );

    expect(apiClientMock.RegenerateSubscriptionKeys).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorNotFound");
    if (result.kind === "IResponseErrorNotFound") {
      expect(result.detail).toEqual("Not found: Resource not found");
    }
  });

  it("should respond with an internal error if RegenerateSubscriptionKeys returns Bad request", async () => {
    const apiClientMock = {
      RegenerateSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 400 }))
      )
    };

    const regenerateServiceKeyHandler = RegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await regenerateServiceKeyHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aSubscriptionKeyTypePayload
    );

    expect(apiClientMock.RegenerateSubscriptionKeys).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with forbidden if getUser returns Forbidden", async () => {
    const apiClientMock = {
      RegenerateSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 403 }))
      )
    };

    const regenerateServiceKeyHandler = RegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await regenerateServiceKeyHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aSubscriptionKeyTypePayload
    );

    expect(apiClientMock.RegenerateSubscriptionKeys).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });
});
