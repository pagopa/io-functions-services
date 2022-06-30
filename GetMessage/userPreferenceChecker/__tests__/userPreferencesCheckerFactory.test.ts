import * as TE from "fp-ts/TaskEither";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";

import { Semver } from "@pagopa/ts-commons/lib/strings";

import {
  AccessReadMessageStatusEnum,
  ServicePreference
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";

import {
  isAppVersionHandlingReadAuthorization,
  ServicePreferencesGetter,
  userPreferenceCheckerVersionUNKNOWNToVersionWithReadAuth,
  userPreferenceCheckerVersionWithReadAuth,
  userPreferencesCheckerFactory
} from "../userPreferencesCheckerFactory";

import {
  aFiscalCode,
  aRetrievedProfile,
  aServiceId
} from "../../../__mocks__/mocks";

const MIN_READ_STATUS_PREFERENCES_VERSION = "1.15.3" as Semver;
const PREV_APP_VERIONS = "1.13.8" as Semver;
const NEWER_APP_VERSION = "12.1.1" as Semver;

const aServicePreferenceWithUNKNOWN: ServicePreference = {
  fiscalCode: aFiscalCode,
  serviceId: aServiceId,
  isInboxEnabled: true,
  isEmailEnabled: true,
  isWebhookEnabled: true,
  accessReadMessageStatus: AccessReadMessageStatusEnum.UNKNOWN
} as ServicePreference;

const aServicePreferenceWithALLOW = {
  ...aServicePreferenceWithUNKNOWN,
  accessReadMessageStatus: AccessReadMessageStatusEnum.ALLOW
};

const aServicePreferenceWithDENY = {
  ...aServicePreferenceWithUNKNOWN,
  accessReadMessageStatus: AccessReadMessageStatusEnum.DENY
};

const mockServicePreferencesGetter = jest.fn(((_fiscalCode, _serviceId) =>
  TE.of(O.none)) as ServicePreferencesGetter);

describe("userPreferencesCheckerFactory |> userPreferenceCheckerVersionWithReadAuth", () => {
  it("should return an Error if servicePreferencesGetter returns an Error", async () => {
    mockServicePreferencesGetter.mockReturnValueOnce(
      TE.left(Error("an Error"))
    );

    const res = await userPreferenceCheckerVersionWithReadAuth(
      mockServicePreferencesGetter
    ).canAccessMessageReadStatus(aServiceId, aFiscalCode)();

    expect(res).toStrictEqual(E.left(Error("an Error")));
  });

  it.each`
    title                                                                                              | I_servicePreference                      | O_expectedResult
    ${"should return true if service preference does not exist"}                                       | ${O.none}                                | ${true}
    ${"should return true if service preference exists and accessReadMessageStatus is set to ALLOW"}   | ${O.some(aServicePreferenceWithALLOW)}   | ${true}
    ${"should return true if service preference exists and accessReadMessageStatus is set to UNKNOWN"} | ${O.some(aServicePreferenceWithUNKNOWN)} | ${true}
    ${"should return false if service preference exists and accessReadMessageStatus is set to DENY"}   | ${O.some(aServicePreferenceWithDENY)}    | ${false}
  `("$title", async ({ I_servicePreference, O_expectedResult }) => {
    mockServicePreferencesGetter.mockReturnValueOnce(
      TE.of(I_servicePreference)
    );

    const res = await userPreferenceCheckerVersionWithReadAuth(
      mockServicePreferencesGetter
    ).canAccessMessageReadStatus(aServiceId, aFiscalCode)();

    expect(res).toStrictEqual(E.right(O_expectedResult));
  });
});

describe("userPreferencesCheckerFactory |> userPreferenceCheckerVersionUNKNOWNToVersionWithReadAuth", () => {
  it.each`
    title                                                                                               | I_servicePreference                      | O_expectedResult
    ${"should return false if service preference does not exist"}                                       | ${O.none}                                | ${false}
    ${"should return false if service preference exists and accessReadMessageStatus is set to ALLOW"}   | ${O.some(aServicePreferenceWithALLOW)}   | ${false}
    ${"should return false if service preference exists and accessReadMessageStatus is set to UNKNOWN"} | ${O.some(aServicePreferenceWithUNKNOWN)} | ${false}
    ${"should return false if service preference exists and accessReadMessageStatus is set to DENY"}    | ${O.some(aServicePreferenceWithDENY)}    | ${false}
  `("$title", async ({ I_servicePreference, O_expectedResult }) => {
    mockServicePreferencesGetter.mockReturnValueOnce(
      TE.of(I_servicePreference)
    );

    const res = await userPreferenceCheckerVersionUNKNOWNToVersionWithReadAuth.canAccessMessageReadStatus(
      aServiceId,
      aFiscalCode
    )();

    expect(res).toStrictEqual(E.right(O_expectedResult));
  });
});

describe("userPreferencesCheckerFactory |> userPreferencesCheckerFactory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const f = require("../userPreferencesCheckerFactory");

  // userPreferenceCheckerVersionUNKNOWNToVersionWithReadAuth,
  //   userPreferenceCheckerVersionWithReadAuth,
  const spyUnknownImplementation = jest.spyOn(
    userPreferenceCheckerVersionUNKNOWNToVersionWithReadAuth,
    "canAccessMessageReadStatus"
  );
  const spyVersionGreaterThanImplementation = jest.spyOn(
    f,
    "userPreferenceCheckerVersionWithReadAuth"
  );

  it("should call userPreferenceCheckerVersionUNKNOWNToVersionWithReadAuth if appVersion is UNKNOWN", async () => {
    mockServicePreferencesGetter.mockReturnValueOnce(TE.of(O.none));

    const res = await userPreferencesCheckerFactory(
      {
        ...aRetrievedProfile,
        lastAppVersion: "UNKNOWN"
      },
      mockServicePreferencesGetter,
      MIN_READ_STATUS_PREFERENCES_VERSION
    ).canAccessMessageReadStatus(aServiceId, aFiscalCode)();

    expect(spyUnknownImplementation).toHaveBeenCalled();
    expect(spyVersionGreaterThanImplementation).not.toHaveBeenCalled();

    expect(res).toStrictEqual(E.right(false));
  });

  it("should call userPreferenceCheckerVersionUNKNOWNToVersionWithReadAuth if appVersion is < MIN_READ_STATUS_PREFERENCES_VERSION", async () => {
    mockServicePreferencesGetter.mockReturnValueOnce(TE.of(O.none));

    const res = await userPreferencesCheckerFactory(
      {
        ...aRetrievedProfile,
        lastAppVersion: PREV_APP_VERIONS
      },
      mockServicePreferencesGetter,
      MIN_READ_STATUS_PREFERENCES_VERSION
    ).canAccessMessageReadStatus(aServiceId, aFiscalCode)();

    expect(spyUnknownImplementation).toHaveBeenCalled();
    expect(spyVersionGreaterThanImplementation).not.toHaveBeenCalled();

    expect(res).toStrictEqual(E.right(false));
  });

  it("should call userPreferenceCheckerVersionWithReadAuth if appVersion is = MIN_READ_STATUS_PREFERENCES_VERSION", async () => {
    mockServicePreferencesGetter.mockReturnValueOnce(TE.of(O.none));

    const res = await userPreferencesCheckerFactory(
      {
        ...aRetrievedProfile,
        lastAppVersion: MIN_READ_STATUS_PREFERENCES_VERSION
      },
      mockServicePreferencesGetter,
      MIN_READ_STATUS_PREFERENCES_VERSION
    ).canAccessMessageReadStatus(aServiceId, aFiscalCode)();

    expect(spyUnknownImplementation).not.toHaveBeenCalled();
    expect(spyVersionGreaterThanImplementation).toHaveBeenCalled();

    expect(res).toStrictEqual(E.right(true));
  });

  it("should call userPreferenceCheckerVersionWithReadAuth if appVersion is > MIN_READ_STATUS_PREFERENCES_VERSION", async () => {
    mockServicePreferencesGetter.mockReturnValueOnce(TE.of(O.none));

    const res = await userPreferencesCheckerFactory(
      {
        ...aRetrievedProfile,
        lastAppVersion: NEWER_APP_VERSION
      },
      mockServicePreferencesGetter,
      MIN_READ_STATUS_PREFERENCES_VERSION
    ).canAccessMessageReadStatus(aServiceId, aFiscalCode)();

    expect(spyUnknownImplementation).not.toHaveBeenCalled();
    expect(spyVersionGreaterThanImplementation).toHaveBeenCalled();

    expect(res).toStrictEqual(E.right(true));
  });
});

describe("isAppVersionHandlingReadAuthorization", () => {
  it("should return false if currentAppVersion is lower than minAppVersionHandlingReadAuth", () => {
    const res = isAppVersionHandlingReadAuthorization(
      MIN_READ_STATUS_PREFERENCES_VERSION,
      PREV_APP_VERIONS
    );

    expect(res).toStrictEqual(false);
  });

  it("should return true if currentAppVersion is equal to minAppVersionHandlingReadAuth", () => {
    const res = isAppVersionHandlingReadAuthorization(
      MIN_READ_STATUS_PREFERENCES_VERSION,
      MIN_READ_STATUS_PREFERENCES_VERSION
    );

    expect(res).toStrictEqual(true);
  });

  it("should return true if currentAppVersion is greater than minAppVersionHandlingReadAuth", () => {
    const res = isAppVersionHandlingReadAuthorization(
      MIN_READ_STATUS_PREFERENCES_VERSION,
      NEWER_APP_VERSION
    );

    expect(res).toStrictEqual(true);
  });

  it("should return true if a BUILD version is greater than minAppVersionHandlingReadAuth", () => {
    const buildVersion = MIN_READ_STATUS_PREFERENCES_VERSION + ".1";

    const res = isAppVersionHandlingReadAuthorization(
      MIN_READ_STATUS_PREFERENCES_VERSION,
      buildVersion as Semver
    );

    expect(res).toStrictEqual(true);
  });

  it("should return false if a BUILD version is lower than minAppVersionHandlingReadAuth", () => {
    const buildVersion = PREV_APP_VERIONS + ".9";

    const res = isAppVersionHandlingReadAuthorization(
      MIN_READ_STATUS_PREFERENCES_VERSION,
      buildVersion as Semver
    );

    expect(res).toStrictEqual(false);
  });
});
