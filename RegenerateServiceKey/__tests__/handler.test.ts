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
import { SubscriptionKeyTypeEnum } from "../../generated/api-admin/SubscriptionKeyType";
import { SubscriptionKeyTypePayload } from "../../generated/api-admin/SubscriptionKeyTypePayload";
import { GetRegenerateServiceKeyHandler } from "../handler";

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

describe("GetRegenerateServiceKeyHandler", () => {
  it("should respond with a regenerated subscription primary key", async () => {
    const apiClientMock = {
      RegenerateSubscriptionKeys: jest.fn(() =>
        Promise.resolve(
          right({ status: 200, value: regeneratedPrimarySubscriptionKeys })
        )
      )
    };

    const getRegenerateServiceKeyHandler = GetRegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await getRegenerateServiceKeyHandler(
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

    const getRegenerateServiceKeyHandler = GetRegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await getRegenerateServiceKeyHandler(
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

  it("should respond with an internal error if RegenerateSubscriptionKeys does not respond", async () => {
    const apiClientMock = {
      RegenerateSubscriptionKeys: jest.fn(() =>
        Promise.reject(new Error("Timeout"))
      )
    };

    const getRegenerateServiceKeyHandler = GetRegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await getRegenerateServiceKeyHandler(
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

    const getRegenerateServiceKeyHandler = GetRegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await getRegenerateServiceKeyHandler(
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

    const getRegenerateServiceKeyHandler = GetRegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await getRegenerateServiceKeyHandler(
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

    const getRegenerateServiceKeyHandler = GetRegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await getRegenerateServiceKeyHandler(
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

    const getRegenerateServiceKeyHandler = GetRegenerateServiceKeyHandler(
      apiClientMock as any
    );
    const result = await getRegenerateServiceKeyHandler(
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
