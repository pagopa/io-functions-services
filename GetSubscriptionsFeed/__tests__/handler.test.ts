/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonar/sonar-max-lines-per-function */
/* eslint-disable sonarjs/no-identical-functions */

import { TableService } from "azure-storage";
import * as dateFmt from "date-fns";
import * as endOfTomorrow from "date-fns/end_of_tomorrow";
import * as startOfYesterday from "date-fns/start_of_yesterday";
import { FiscalCodeHash } from "../../generated/definitions/FiscalCodeHash";
import { GetSubscriptionsFeedHandler } from "../handler";

import { anIncompleteService, aValidService } from "../../__mocks__/mocks";

const tomorrow = endOfTomorrow();

const yesterday = startOfYesterday();

const yesterdayUTC = dateFmt.format(yesterday, "YYYY-MM-DD");

const userAttrs = {
  email: "example@mail.com",
  kind: "IAzureUserAttributes",
  service: aValidService
};

const anHashedFiscalCode = "77408089123C62362C2D70E4C262BB45E268A3D477335D9C4A383521FA772AAE" as FiscalCodeHash;
const anotherHashedFiscalCode = "77408089123C62362C2D70E4C262BB45E268A3D477335D9C4A383521FA772AAA" as FiscalCodeHash;
const anotherThirdHashedFiscalCode = "77408089123C62362C2D70E4C262BB45E268A3D477335D9C4A383521FA772BBB" as FiscalCodeHash;

const queryEntitiesProfileSubscriptionMock = (
  entries: ReadonlyArray<any>,
  subscriptionSuffix: "S" | "U"
) =>
  jest.fn((_, __, ___, cb) => {
    return cb(
      null,
      {
        entries:
          entries.length > 0
            ? entries.map(e => ({
                RowKey: { _: `P-${yesterdayUTC}-${subscriptionSuffix}-${e}` }
              }))
            : []
      },
      { isSuccessful: true }
    );
  });

const queryEntitiesServiceSubscriptionMock = (
  entries: ReadonlyArray<any>,
  subscriptionSuffix: "S" | "U"
) =>
  jest.fn((_, __, ___, cb) => {
    return cb(
      null,
      {
        entries:
          entries.length > 0
            ? entries.map(e => ({
                RowKey: {
                  _: `S-${yesterdayUTC}-${aValidService.serviceId}-${subscriptionSuffix}-${e}`
                }
              }))
            : []
      },
      { isSuccessful: true }
    );
  });

const emptyQueryEntities = queryEntitiesProfileSubscriptionMock([], "S");

describe("GetSubscriptionsFeedHandler", () => {
  it("should respond with Not Found if Date.now() is lower than given subscriptionDate", async () => {
    const getSubscriptionsFeedHandler = GetSubscriptionsFeedHandler(
      {} as any,
      "subscriptionFeedByDay",
      true
    );
    const result = await getSubscriptionsFeedHandler(
      {} as any,
      {} as any,
      userAttrs as any,
      dateFmt.format(tomorrow, "YYYY-MM-DD")
    );
    expect(result.kind).toBe("IResponseErrorNotFound");
  });

  it("should return an empty feed json if no changes happened for the given subscriptionDate", async () => {
    const tableServiceMock = ({
      queryEntities: queryEntitiesProfileSubscriptionMock([], "S")
    } as any) as TableService;

    const getSubscriptionsFeedHandler = GetSubscriptionsFeedHandler(
      tableServiceMock,
      "subscriptionFeedByDay",
      true
    );

    const result = await getSubscriptionsFeedHandler(
      {} as any,
      {} as any,
      userAttrs as any,
      yesterdayUTC
    );
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        dateUTC: yesterdayUTC,
        subscriptions: [],
        unsubscriptions: []
      });
    }
  });

  it("should return a correct feed json if there are only profile registrations", async () => {
    const queryEntities = jest.fn();
    queryEntities.mockImplementationOnce(
      queryEntitiesProfileSubscriptionMock(
        [anHashedFiscalCode, anotherHashedFiscalCode],
        "S"
      )
    );
    queryEntities.mockImplementation(emptyQueryEntities);
    const tableServiceMock = ({
      queryEntities
    } as any) as TableService;

    const getSubscriptionsFeedHandler = GetSubscriptionsFeedHandler(
      tableServiceMock,
      "subscriptionFeedByDay",
      true
    );

    const result = await getSubscriptionsFeedHandler(
      {} as any,
      {} as any,
      userAttrs as any,
      yesterdayUTC
    );
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        dateUTC: yesterdayUTC,
        subscriptions: [anHashedFiscalCode, anotherHashedFiscalCode],
        unsubscriptions: []
      });
    }
  });

  it("should return a correct feed json if there are profile registrations and another service subscription", async () => {
    const queryEntities = jest.fn();
    // Profile subscriptions
    queryEntities.mockImplementationOnce(
      queryEntitiesProfileSubscriptionMock(
        [anHashedFiscalCode, anotherHashedFiscalCode],
        "S"
      )
    );
    // profile unsubscriptions
    queryEntities.mockImplementationOnce(emptyQueryEntities);
    // service subscriptions
    queryEntities.mockImplementationOnce(
      queryEntitiesServiceSubscriptionMock([anotherThirdHashedFiscalCode], "S")
    );
    queryEntities.mockImplementation(emptyQueryEntities);
    const tableServiceMock = ({
      queryEntities
    } as any) as TableService;

    const getSubscriptionsFeedHandler = GetSubscriptionsFeedHandler(
      tableServiceMock,
      "subscriptionFeedByDay",
      true
    );

    const result = await getSubscriptionsFeedHandler(
      {} as any,
      {} as any,
      userAttrs as any,
      yesterdayUTC
    );
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        dateUTC: yesterdayUTC,
        subscriptions: [
          anHashedFiscalCode,
          anotherHashedFiscalCode,
          anotherThirdHashedFiscalCode
        ],
        unsubscriptions: []
      });
    }
  });

  it("should return a correct feed json if there are profile registrations and the same fiscal codes in service subscriptions", async () => {
    const queryEntities = jest.fn();
    // Profile subscriptions
    queryEntities.mockImplementationOnce(
      queryEntitiesProfileSubscriptionMock(
        [anHashedFiscalCode, anotherHashedFiscalCode],
        "S"
      )
    );
    // profile unsubscriptions
    queryEntities.mockImplementationOnce(emptyQueryEntities);
    // service subscriptions
    queryEntities.mockImplementationOnce(
      queryEntitiesServiceSubscriptionMock(
        [anHashedFiscalCode, anotherHashedFiscalCode],
        "S"
      )
    );
    queryEntities.mockImplementation(emptyQueryEntities);
    const tableServiceMock = ({
      queryEntities
    } as any) as TableService;

    const getSubscriptionsFeedHandler = GetSubscriptionsFeedHandler(
      tableServiceMock,
      "subscriptionFeedByDay",
      true
    );

    const result = await getSubscriptionsFeedHandler(
      {} as any,
      {} as any,
      userAttrs as any,
      yesterdayUTC
    );
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        dateUTC: yesterdayUTC,
        subscriptions: [anHashedFiscalCode, anotherHashedFiscalCode],
        unsubscriptions: []
      });
    }
  });

  it("should return a correct feed json if there are profile delete and the same fiscal codes in service subscriptions", async () => {
    const queryEntities = jest.fn();
    // Profile subscriptions
    queryEntities.mockImplementationOnce(emptyQueryEntities);
    // profile unsubscriptions
    queryEntities.mockImplementationOnce(
      queryEntitiesProfileSubscriptionMock(
        [anHashedFiscalCode, anotherHashedFiscalCode],
        "U"
      )
    );
    // service subscriptions
    queryEntities.mockImplementationOnce(
      queryEntitiesServiceSubscriptionMock(
        [anHashedFiscalCode, anotherHashedFiscalCode],
        "S"
      )
    );
    queryEntities.mockImplementation(emptyQueryEntities);
    const tableServiceMock = ({
      queryEntities
    } as any) as TableService;

    const getSubscriptionsFeedHandler = GetSubscriptionsFeedHandler(
      tableServiceMock,
      "subscriptionFeedByDay",
      true
    );

    const result = await getSubscriptionsFeedHandler(
      {} as any,
      {} as any,
      userAttrs as any,
      yesterdayUTC
    );
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        dateUTC: yesterdayUTC,
        subscriptions: [],
        unsubscriptions: [anHashedFiscalCode, anotherHashedFiscalCode]
      });
    }
  });

  it("should return a correct feed json if there are profile subscription skipping the same fiscal codes in service unsubscriptions", async () => {
    const queryEntities = jest.fn();
    // Profile subscriptions
    queryEntities.mockImplementationOnce(
      queryEntitiesProfileSubscriptionMock(
        [
          anHashedFiscalCode,
          anotherHashedFiscalCode,
          anotherThirdHashedFiscalCode
        ],
        "S"
      )
    );
    // profile unsubscriptions
    queryEntities.mockImplementationOnce(emptyQueryEntities);
    // service subscriptions
    queryEntities.mockImplementationOnce(emptyQueryEntities);
    queryEntities.mockImplementation(
      queryEntitiesServiceSubscriptionMock(
        [anHashedFiscalCode, anotherHashedFiscalCode],
        "U"
      )
    );
    const tableServiceMock = ({
      queryEntities
    } as any) as TableService;

    const getSubscriptionsFeedHandler = GetSubscriptionsFeedHandler(
      tableServiceMock,
      "subscriptionFeedByDay",
      true
    );

    const result = await getSubscriptionsFeedHandler(
      {} as any,
      {} as any,
      userAttrs as any,
      yesterdayUTC
    );
    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        dateUTC: yesterdayUTC,
        subscriptions: [anotherThirdHashedFiscalCode],
        unsubscriptions: []
      });
    }
  });
});

it("should return ResponseErrorForbiddenNotAuthorized if the Service hasn't the required quality fields", async () => {
  const queryEntities = jest.fn();
  const tableServiceMock = ({
    queryEntities
  } as any) as TableService;

  const getSubscriptionsFeedHandler = GetSubscriptionsFeedHandler(
    tableServiceMock,
    "subscriptionFeedByDay",
    true
  );

  const result = await getSubscriptionsFeedHandler(
    {} as any,
    {} as any,
    {
      ...userAttrs,
      service: anIncompleteService
    } as any,
    yesterdayUTC
  );
  expect(result.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  expect(queryEntities).not.toBeCalled();
});
