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

import { ServiceMetadata } from "io-functions-commons/dist/src/models/service";

import { MaxAllowedPaymentAmount } from "io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";

import { left, right } from "fp-ts/lib/Either";
import { ServiceScopeEnum } from "io-functions-commons/dist/generated/definitions/ServiceScope";
import * as reporters from "italia-ts-commons/lib/reporters";
import { Service } from "../../generated/api-admin/Service";
import { Subscription } from "../../generated/api-admin/Subscription";
import { UserInfo } from "../../generated/api-admin/UserInfo";
import { ServicePayload } from "../../generated/definitions/ServicePayload";
import { UpdateServiceHandler } from "../handler";

const mockContext = {
  // tslint:disable-next-line: no-console
  log: console.log
} as any;

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;
const anEmail = "test@example.com" as EmailString;

const aServiceId = "s123" as NonEmptyString;

const aServicePayload: ServicePayload = {
  authorized_cidrs: [],
  department_name: "IT" as NonEmptyString,
  organization_fiscal_code: anOrganizationFiscalCode,
  organization_name: "AgID" as NonEmptyString,
  service_name: "Test" as NonEmptyString
};

const aTokenName = "TOKEN_NAME" as NonEmptyString;
const someServicesMetadata: ServiceMetadata = {
  scope: ServiceScopeEnum.NATIONAL,
  tokenName: aTokenName
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

const aRetrievedService: Service = {
  authorized_cidrs: [],
  authorized_recipients: [],
  department_name: "IT" as NonEmptyString,
  is_visible: true,
  max_allowed_payment_amount: 0 as MaxAllowedPaymentAmount,
  organization_fiscal_code: anOrganizationFiscalCode,
  organization_name: "AgID" as NonEmptyString,
  require_secure_channels: false,
  service_id: aServiceId,
  service_metadata: someServicesMetadata,
  service_name: "Test" as NonEmptyString,
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

const aSubscription: Subscription = {
  id: aServiceId,
  ...someSubscriptionKeys,
  scope: "NATIONAL"
};

const aUserInfo: UserInfo = {
  subscriptions: [
    aSubscription,
    { ...aSubscription, id: "s234" as NonEmptyString }
  ],
  token_name: aTokenName
};

describe("UpdateServiceHandler", () => {
  it("should respond with an updated service with subscriptionKeys by providing a servicePayload", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        ...aService,
        ...someSubscriptionKeys
      });
    }
  });

  it("should respond with an Unauthorized error if service is not owned by current user", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      "aServiceId" as NonEmptyString,
      aServicePayload
    );

    expect(apiClientMock.updateService).not.toHaveBeenCalled();
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getService).not.toHaveBeenCalled();
    expect(apiClientMock.getUser).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with an internal error if getService does not respond", async () => {
    const apiClientMock = {
      getService: jest.fn(() => Promise.reject(new Error("Timeout"))),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).not.toHaveBeenCalled();
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).not.toHaveBeenCalled();
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if getService returns Errors", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).not.toHaveBeenCalled();
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getUser).not.toHaveBeenCalled();
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with Unauthorized if getService returns unauthorized", async () => {
    const apiClientMock = {
      getService: jest.fn(() => Promise.resolve(right({ status: 401 }))),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).not.toHaveBeenCalled();
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getUser).not.toHaveBeenCalled();
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorUnauthorized");
    if (result.kind === "IResponseErrorUnauthorized") {
      expect(result.detail).toEqual("Unauthorized: Unauthorized");
    }
  });

  it("should respond with Not found if no service was found for the given serviceid", async () => {
    const apiClientMock = {
      getService: jest.fn(() => Promise.resolve(right({ status: 404 }))),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).not.toHaveBeenCalled();
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getUser).not.toHaveBeenCalled();
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorNotFound");
    if (result.kind === "IResponseErrorNotFound") {
      expect(result.detail).toEqual("Not found: Resource not found");
    }
  });

  it("should respond with an internal error if getUser does not respond", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() => Promise.reject(new Error("Timeout"))),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).not.toHaveBeenCalled();
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if getService returns Errors", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() => Promise.resolve(left({ err: "ValidationError" }))),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);
    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).not.toHaveBeenCalled();
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with Not found if no user was found", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() => Promise.resolve(right({ status: 404 }))),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).not.toHaveBeenCalled();
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorNotFound");
    if (result.kind === "IResponseErrorNotFound") {
      expect(result.detail).toEqual("Not found: Resource not found");
    }
  });

  it("should respond with an internal error if getUser returns Bad request", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() => Promise.resolve(right({ status: 400 }))),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).not.toHaveBeenCalled();
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with forbidden if getUser returns Forbidden", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() => Promise.resolve(right({ status: 403 }))),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).not.toHaveBeenCalled();
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with an internal error if updateService does not respond", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() => Promise.reject(new Error("Timeout")))
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if updateService returns Errors", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      )
    };

    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with Unauthorized error if updateService returns Unauthorized", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() => Promise.resolve(right({ status: 401 })))
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseErrorUnauthorized");
    if (result.kind === "IResponseErrorUnauthorized") {
      expect(result.detail).toEqual("Unauthorized: Unauthorized");
    }
  });

  it("should respond with Not Found if no service was found", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: someSubscriptionKeys }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() => Promise.resolve(right({ status: 404 })))
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).not.toHaveBeenCalled();
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseErrorNotFound");
    if (result.kind === "IResponseErrorNotFound") {
      expect(result.detail).toEqual("Not found: Resource not found");
    }
  });

  it("should respond with an internal error if getSubscriptionKeys does not respond", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() => Promise.reject(new Error("Timeout"))),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if getSubscriptionKeys returns Errors", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(left({ err: "ValidationError" }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };
    jest
      .spyOn(reporters, "errorsToReadableMessages")
      .mockImplementation(() => ["ValidationErrors"]);

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with an internal error if getSubscriptionKeys returns Bad request", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 400 }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should respond with forbidden if getSubscriptionKeys returns Forbidden", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 403 }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should respond with Not found if no subscriptionKeys were found by the given serviceId", async () => {
    const apiClientMock = {
      getService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aRetrievedService }))
      ),
      getSubscriptionKeys: jest.fn(() =>
        Promise.resolve(right({ status: 404 }))
      ),
      getUser: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aUserInfo }))
      ),
      updateService: jest.fn(() =>
        Promise.resolve(right({ status: 200, value: aService }))
      )
    };

    const updateServiceHandler = UpdateServiceHandler(apiClientMock as any);
    const result = await updateServiceHandler(
      mockContext,
      aUserAuthenticationDeveloper,
      undefined as any, // not used
      someUserAttributes,
      aServiceId,
      aServicePayload
    );

    expect(apiClientMock.updateService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getSubscriptionKeys).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getService).toHaveBeenCalledTimes(1);
    expect(apiClientMock.getUser).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("IResponseErrorNotFound");
  });
});
