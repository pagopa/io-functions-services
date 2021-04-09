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

import { MaxAllowedPaymentAmount } from "@pagopa/io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";

import { left, right } from "fp-ts/lib/Either";
import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import { ServiceMetadata } from "@pagopa/io-functions-commons/dist/src/models/service";
import * as reporters from "italia-ts-commons/lib/reporters";
import { Subscription } from "../../generated/api-admin/Subscription";
import { UserInfo } from "../../generated/api-admin/UserInfo";
import { ServicePayload } from "../../generated/definitions/ServicePayload";
import { CreateServiceHandler } from "../handler";

const mockContext = {
  // eslint-disable no-console
  log: {
    error: console.error,
    info: console.log
  }
} as any;

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;
const anEmail = "test@example.com" as EmailString;

const aServiceId = "s123" as NonEmptyString;

const aTokenName = "TOKEN_NAME" as NonEmptyString;

const someServicesMetadata: ServiceMetadata = {
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

const aUserInfo: UserInfo = {
  subscriptions: [
    aSubscription,
    { ...aSubscription, id: "s234" as NonEmptyString }
  ],
  token_name: aTokenName
};

const mockUlidGenerator = jest.fn(() => aServiceId);

const productName = "IO_API_SERVICES" as NonEmptyString;
const sandboxFiscalCode = "BBBCCC00A11B123X" as NonEmptyString;

const mockAppinsights = {
  trackEvent: jest.fn()
};

describe("CreateServiceHandler", () => {
  it("should respond with a created service with subscriptionKeys by providing a servicePayload", async () => {
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      )
    };

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
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      )
    };

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

  it("should respond with an internal error if createSubscription does not respond", async () => {
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() => Promise.reject(new Error("Timeout")))
    };

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
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      )
    };

    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);

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
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() => Promise.resolve(right({ status: 400 })))
    };

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
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() => Promise.resolve(right({ status: 403 })))
    };

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
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() => Promise.resolve(right({ status: 404 })))
    };

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
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      ),
      getUser: jest.fn(() => Promise.reject(new Error("Timeout")))
    };

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
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      ),
      getUser: jest.fn(() => Promise.resolve(left({ err: "ValidationError" })))
    };

    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);
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
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      ),
      getUser: jest.fn(() => Promise.resolve(right({ status: 404 })))
    };

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
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      ),
      getUser: jest.fn(() => Promise.resolve(right({ status: 400 })))
    };

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
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      ),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      ),
      getUser: jest.fn(() => Promise.resolve(right({ status: 403 })))
    };

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
    const apiClientMock = {
      createService: jest.fn(() => Promise.reject(new Error("Timeout"))),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      )
    };

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
    const apiClientMock = {
      createService: jest.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      ),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      )
    };

    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);

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
    const apiClientMock = {
      createService: jest.fn(() => Promise.resolve(right({ status: 401 }))),
      createSubscription: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aSubscription }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      )
    };

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
});
