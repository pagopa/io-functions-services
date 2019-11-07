jest.mock("winston");

import { TableService } from "azure-storage";
import { MaxAllowedPaymentAmount } from "io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";
import { toAuthorizedCIDRs } from "io-functions-commons/dist/src/models/service";
import {
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import { NonNegativeNumber } from "italia-ts-commons/lib/numbers";
import {
  EmailString,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";

import { GetSubscriptionsFeedHandler } from "../handler";
import { TableEntry } from "../utils";

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;
const anEmail = "test@example.com" as EmailString;

const aUserAuthenticationDeveloper: IAzureApiAuthorization = {
  groups: new Set([UserGroup.ApiMessageRead, UserGroup.ApiMessageWrite]),
  kind: "IAzureApiAuthorization",
  subscriptionId: "s123" as NonEmptyString,
  userId: "u123" as NonEmptyString
};

const someUserAttributes: IAzureUserAttributes = {
  email: anEmail,
  kind: "IAzureUserAttributes",
  service: {
    authorizedCIDRs: toAuthorizedCIDRs([]),
    authorizedRecipients: new Set([]),
    departmentName: "IT" as NonEmptyString,
    isVisible: true,
    maxAllowedPaymentAmount: 0 as MaxAllowedPaymentAmount,
    organizationFiscalCode: anOrganizationFiscalCode,
    organizationName: "AgID" as NonEmptyString,
    requireSecureChannels: false,
    serviceId: "test" as NonEmptyString,
    serviceName: "Test" as NonEmptyString,
    version: 1 as NonNegativeNumber
  }
};

const mockAzureApiAuthorization: IAzureApiAuthorization = {
  groups: new Set(),
  kind: "IAzureApiAuthorization",
  subscriptionId: "" as NonEmptyString,
  userId: "" as NonEmptyString
};

const mockTableEntry: TableEntry = {
  RowKey: {
    _:
      "1-2-3-4-5-6-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
};

const mockQueryEntityResuls: TableService.QueryEntitiesResult<TableEntry> = {
  entries: [mockTableEntry]
};

describe("GetSubscriptionFeedHandler", () => {
  it("should respond error since date now is > available since", async () => {
    const tableServiceMock = {
      queryEntities: jest.fn((_, __, ___, f) => {
        f(undefined, mockQueryEntityResuls, { isSuccessfull: true });
      })
    };
    // use lolex?
    const todayDate = new Date().toISOString().slice(0, 10);

    const getSubscriptionFeedHandler = GetSubscriptionsFeedHandler(
      tableServiceMock as any,
      "subscriptionsFeedTable"
    );

    const result = await getSubscriptionFeedHandler(
      aUserAuthenticationDeveloper,
      undefined as any,
      someUserAttributes,
      todayDate
    );

    expect(tableServiceMock.queryEntities).toHaveBeenCalledTimes(0);
    expect(result.kind).toBe("IResponseErrorNotFound");
  });

  it("should respond success if user has subscriptions to services", async () => {
    const tableServiceMock = {
      queryEntities: jest.fn((_, __, ___, f) => {
        f(undefined, mockQueryEntityResuls, { isSuccessful: true });
      })
    };
    // use lolex?
    const todayDate = "2018-10-20";
    const getSubscriptionFeedHandler = GetSubscriptionsFeedHandler(
      tableServiceMock as any,
      "subscriptionsFeedTable"
    );

    const result = await getSubscriptionFeedHandler(
      aUserAuthenticationDeveloper,
      undefined as any,
      someUserAttributes,
      todayDate
    );

    expect(tableServiceMock.queryEntities).toHaveBeenCalledTimes(3);
    expect(result.kind).toBe("IResponseSuccessJson");
  });
});
