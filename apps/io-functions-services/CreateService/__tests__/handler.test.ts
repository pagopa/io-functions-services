/* eslint-disable @typescript-eslint/no-explicit-any */

import { Subscription } from "@pagopa/io-functions-admin-sdk/Subscription";
import { UserInfo } from "@pagopa/io-functions-admin-sdk/UserInfo";
import { MaxAllowedPaymentAmount } from "@pagopa/io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";
import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import { StandardServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/StandardServiceCategory";
import {
  Service,
  ServiceMetadata
} from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import * as reporters from "@pagopa/ts-commons/lib/reporters";
import {
  EmailString,
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import { left, right } from "fp-ts/lib/Either";
import * as E from "fp-ts/lib/Either";
import { isSome } from "fp-ts/lib/Option";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockContext } from "../../__mocks__/context.mock";
import { ServicePayload } from "../../generated/definitions/ServicePayload";
import {
  CreateServiceHandler,
  getAuthorizedRecipientsFromPayload
} from "../handler";

const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;
const anEmail = "test@example.com" as EmailString;

const aServiceId = "s123" as NonEmptyString;
const aManageSubscriptionId = "MANAGE-123" as NonEmptyString;
const aTokenName = "TOKEN_NAME" as NonEmptyString;

const someServicesMetadata: ServiceMetadata = {
  category: StandardServiceCategoryEnum.STANDARD,
  customSpecialFlow: undefined,
  scope: ServiceScopeEnum.NATIONAL,
  tokenName: aTokenName
};

const aServicePayload: ServicePayload = {
  authorized_cidrs: [],
  department_name: "IT" as NonEmptyString,
  is_visible: true,
  organization_fiscal_code: anOrganizationFiscalCode,
  organization_name: "AgID" as NonEmptyString,
  service_metadata: someServicesMetadata,
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
  serviceMetadata: someServicesMetadata,
  serviceName: "Test" as NonEmptyString,
  version: 1 as NonNegativeInteger
} as Service & {
  readonly version: NonNegativeInteger;
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

const aUserAuthenticationDeveloperWithManageKey: IAzureApiAuthorization = {
  ...aUserAuthenticationDeveloper,
  subscriptionId: aManageSubscriptionId
};

const aUserInfo: UserInfo = {
  token_name: aTokenName
};

const mockUlidGenerator = vi.fn(() => aServiceId);

const productName = "IO_API_SERVICES" as NonEmptyString;
const sandboxFiscalCode = "BBBCCC00A11B123X" as NonEmptyString;
const authorizedRecipients = [
  "BBBCCC00A11B123X" as FiscalCode,
  "BBBCCC00A11B321X" as FiscalCode
] as readonly FiscalCode[];

const aServiceWithFiscalCodeArray = {
  ...aService,
  authorizedRecipients: new Set(authorizedRecipients)
};

const mockAppinsights = {
  trackEvent: vi.fn()
};

// --------------------

const timeoutResult = async () => {
  throw new Error("Timeout");
};

const createServiceOk = async () => E.right({ status: 200, value: aService });

const createSubscriptionOk = async () =>
  right({ status: 200, value: aSubscription });
const createSubscriptionKO = (status: number) => async () => right({ status });

const getUserOk = async () => right({ status: 200, value: aUserInfo });
const getUserKO = (status: number) => async () => right({ status }) as any;

const createServiceMock = vi.fn(createServiceOk);
const createSubscriptionMock = vi.fn(createSubscriptionOk);
const getUserMock = vi.fn(getUserOk);

const apiClientMock = {
  createService: createServiceMock,
  createSubscription: createSubscriptionMock,
  getUser: getUserMock
};

// eslint-disable-next-line max-lines-per-function
describe("CreateServiceHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("should respond with a created service with subscriptionKeys by providing a servicePayload", async () => {
    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(mockAppinsights.trackEvent).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        ...aService,
        ...someSubscriptionKeys
      });
    }
  });

  it("should create a service with token_name from ADB2C even if servicePayload metadata contains another token_name", async () => {
    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
      {
        ...aServicePayload,
        service_metadata: {
          ...someServicesMetadata,
          token_name: "ANOTHER_TOKEN_NAME" as NonEmptyString
        }
      } as ServicePayload
    );

    expect(apiClientMock.createSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.createService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        ...aService,
        ...someSubscriptionKeys
      });
    }
  });

  it("should create a service with authorized recipients fiscal code", async () => {
    createServiceMock.mockImplementationOnce(async () =>
      E.right({ status: 200, value: aServiceWithFiscalCodeArray })
    );
    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
      {
        ...aServicePayload,
        service_metadata: {
          ...someServicesMetadata
        }
      } as ServicePayload
    );

    expect(apiClientMock.createSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.createService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseSuccessJson");

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        ...aServiceWithFiscalCodeArray,
        ...someSubscriptionKeys
      });
    }
  });

  it("should respond with an internal error if createSubscription does not respond", async () => {
    createSubscriptionMock.mockImplementationOnce(timeoutResult);

    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(mockAppinsights.trackEvent).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if createSubscription returns Errors", async () => {
    createSubscriptionMock.mockImplementationOnce(
      () => Promise.resolve(left({ err: "ValidationError" })) as any
    );

    vi.spyOn(reporters, "errorsToReadableMessages").mockImplementation(() => [
      "ValidationErrors"
    ]);

    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(mockAppinsights.trackEvent).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if createSubscription returns Bad Request", async () => {
    createSubscriptionMock.mockImplementationOnce(
      createSubscriptionKO(400) as any
    );

    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(mockAppinsights.trackEvent).not.toHaveBeenCalled();

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with a Forbidden error if createSubscription returns Forbidden", async () => {
    createSubscriptionMock.mockImplementationOnce(
      createSubscriptionKO(403) as any
    );

    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(mockAppinsights.trackEvent).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with a Not found error if createSubscription returns Not found", async () => {
    apiClientMock.createSubscription.mockImplementationOnce(
      createSubscriptionKO(404) as any
    );

    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(mockAppinsights.trackEvent).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorNotFound");
    if (result.kind === "IResponseErrorNotFound") {
      expect(result.detail).toEqual("Not found: Resource not found");
    }
  });

  it("should respond with an internal error if getUser does not respond", async () => {
    getUserMock.mockImplementationOnce(timeoutResult);

    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(mockAppinsights.trackEvent).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if getService returns Errors", async () => {
    getUserMock.mockImplementationOnce(
      async () => left({ err: "ValidationError" }) as any
    );

    vi.spyOn(reporters, "errorsToReadableMessages").mockImplementation(() => [
      "ValidationErrors"
    ]);
    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(mockAppinsights.trackEvent).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with Not found if no user was found", async () => {
    getUserMock.mockImplementationOnce(getUserKO(404));

    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(mockAppinsights.trackEvent).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorNotFound");
    if (result.kind === "IResponseErrorNotFound") {
      expect(result.detail).toEqual("Not found: Resource not found");
    }
  });

  it("should respond with an internal error if getUser returns Bad request", async () => {
    getUserMock.mockImplementationOnce(getUserKO(400));

    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(mockAppinsights.trackEvent).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with forbidden if getUser returns Forbidden", async () => {
    getUserMock.mockImplementationOnce(getUserKO(403));

    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(mockAppinsights.trackEvent).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });
  it("should respond with an internal error if createService does not respond", async () => {
    createServiceMock.mockImplementationOnce(timeoutResult);

    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(mockAppinsights.trackEvent).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if createService returns Errors", async () => {
    createServiceMock.mockImplementationOnce(
      async () => E.left({ err: "ValidationError" }) as any
    );

    vi.spyOn(reporters, "errorsToReadableMessages").mockImplementation(() => [
      "ValidationErrors"
    ]);

    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(mockAppinsights.trackEvent).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with Unauthorized if createService returns Unauthorized", async () => {
    createServiceMock.mockImplementationOnce(
      async () => right({ status: 401 }) as any
    );

    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
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
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(mockAppinsights.trackEvent).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorUnauthorized");
    if (result.kind === "IResponseErrorUnauthorized") {
      expect(result.detail).toEqual("Unauthorized: Unauthorized");
    }
  });

  it("should retrieve valid CF from a Service Payload", () => {
    const result = getAuthorizedRecipientsFromPayload({
      authorized_recipients: authorizedRecipients
    } as unknown as ServicePayload);
    if (isSome(result)) {
      expect(result.value).toHaveLength(2);
    }
  });

  //MANAGE FLOW

  it("should respond with a created service with subscriptionKeys using a Manage Key", async () => {
    const createServiceHandler = CreateServiceHandler(
      mockAppinsights as any,
      apiClientMock as any,
      mockUlidGenerator as any,
      productName,
      sandboxFiscalCode
    );
    const result = await createServiceHandler(
      mockContext,
      aUserAuthenticationDeveloperWithManageKey,
      undefined as any, // not used
      someUserAttributes,
      aServicePayload
    );

    expect(apiClientMock.createSubscription).toHaveBeenCalledTimes(1);
    expect(apiClientMock.createService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(mockAppinsights.trackEvent).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        ...aService,
        ...someSubscriptionKeys
      });
    }
  });
});
