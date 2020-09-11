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
import { Subscription } from "../../generated/api-admin/Subscription";
import { UserInfo } from "../../generated/api-admin/UserInfo";
import { GetUserServicesHandler } from "../handler";

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

const aSubscription: Subscription = {
  id: aServiceId,
  ...someSubscriptionKeys,
  scope: "NATIONAL"
};

const aUserInfo: UserInfo = {
  subscriptions: [
    aSubscription,
    { ...aSubscription, id: "s234" as NonEmptyString }
  ]
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

describe("GetUserServicesHandler", () => {
  it("should respond with a list of serviceId if requesting user is the owner", async () => {
    const apiClientMock = {
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      )
    };

    const getUserServicesHandler = GetUserServicesHandler(apiClientMock as any);
    const result = await getUserServicesHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes
    );

    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: aUserInfo.subscriptions.map(it => it.id)
      });
    }
  });

  it("should respond with an internal error if getUser does not respond", async () => {
    const apiClientMock = {
      getUser: jest.fn(() => Promise.reject(new Error("Timeout")))
    };

    const getUserServicesHandler = GetUserServicesHandler(apiClientMock as any);
    const result = await getUserServicesHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes
    );

    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if getService returns Errors", async () => {
    const apiClientMock = {
      getUser: jest.fn(() => Promise.resolve(left({ err: "ValidationError" })))
    };

    const getUserServicesHandler = GetUserServicesHandler(apiClientMock as any);
    const result = await getUserServicesHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes
    );

    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with Not found if no user was found", async () => {
    const apiClientMock = {
      getUser: jest.fn(() => Promise.resolve(right({ status: 404 })))
    };

    const getUserServicesHandler = GetUserServicesHandler(apiClientMock as any);
    const result = await getUserServicesHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes
    );

    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorNotFound");
    if (result.kind === "IResponseErrorNotFound") {
      expect(result.detail).toEqual("Not found: Resource not found");
    }
  });

  it("should respond with an internal error if getUser returns Bad request", async () => {
    const apiClientMock = {
      getUser: jest.fn(() => Promise.resolve(right({ status: 400 })))
    };

    const getUserServicesHandler = GetUserServicesHandler(apiClientMock as any);
    const result = await getUserServicesHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes
    );

    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with forbidden if getUser returns Forbidden", async () => {
    const apiClientMock = {
      getUser: jest.fn(() => Promise.resolve(right({ status: 403 })))
    };

    const getUserServicesHandler = GetUserServicesHandler(apiClientMock as any);
    const result = await getUserServicesHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes
    );

    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });
});
