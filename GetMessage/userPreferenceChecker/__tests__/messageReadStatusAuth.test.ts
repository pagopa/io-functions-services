import * as TE from "fp-ts/TaskEither";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";

import { Semver } from "@pagopa/ts-commons/lib/strings";

import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { ProfileModel } from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  AccessReadMessageStatusEnum,
  RetrievedServicePreference,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";

import { canAccessMessageReadStatus } from "../messageReadStatusAuth";

import {
  aFiscalCode,
  aRetrievedProfile,
  aServiceId,
  autoProfileServicePreferencesSettings,
  legacyProfileServicePreferencesSettings
} from "../../../__mocks__/mocks";

const MIN_READ_STATUS_PREFERENCES_VERSION = "1.5.3" as Semver;
const PREV_APP_VERIONS = "1.3.8" as Semver;
const NEWER_APP_VERSION = "3.1.1" as Semver;

const aRetrievedServicePreference: RetrievedServicePreference = {
  fiscalCode: aFiscalCode,
  serviceId: aServiceId,
  isInboxEnabled: true,
  isEmailEnabled: true,
  isWebhookEnabled: true
} as RetrievedServicePreference;

// --------------------

const mockProfileFindLastVersionByModelId = jest.fn();
const mockServicePreferencesFind = jest.fn();

const profileModel = ({
  //TaskEither<CosmosErrors, O.Option<TR>>
  findLastVersionByModelId: mockProfileFindLastVersionByModelId
} as unknown) as ProfileModel;

const servicePreferenceModel = ({
  find: mockServicePreferencesFind
} as unknown) as ServicesPreferencesModel;

// ----------------------------
// Tests
// ----------------------------

describe("canAccessMessageReadStatus |> ok", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return false if profile lastAppVersion is UNKNOWN", async () => {
    mockProfileFindLastVersionByModelId.mockReturnValueOnce(
      TE.of(O.some(aRetrievedProfile))
    );

    const res = await canAccessMessageReadStatus(
      profileModel,
      servicePreferenceModel,
      MIN_READ_STATUS_PREFERENCES_VERSION
    )(aServiceId, aFiscalCode)();

    expect(res).toStrictEqual(E.right(false));

    // Do not call service preferences if app version is UNKNOWN
    expect(mockServicePreferencesFind).not.toHaveBeenCalled();
  });

  it("should return false if profile lastAppVersion is < MIN_READ_STATUS_PREFERENCES_VERSION", async () => {
    mockProfileFindLastVersionByModelId.mockReturnValueOnce(
      TE.of(O.some({ ...aRetrievedProfile, lastAppVersion: PREV_APP_VERIONS }))
    );

    const res = await canAccessMessageReadStatus(
      profileModel,
      servicePreferenceModel,
      MIN_READ_STATUS_PREFERENCES_VERSION
    )(aServiceId, aFiscalCode)();

    expect(res).toStrictEqual(E.right(false));

    // Do not call service preferences if app version is UNKNOWN
    expect(mockServicePreferencesFind).not.toHaveBeenCalled();
  });

  it("should return false if profile servicePreferencesSettings is of type LEGACY (version is -1)", async () => {
    mockProfileFindLastVersionByModelId.mockReturnValueOnce(
      TE.of(O.some(aRetrievedProfile))
    );

    const res = await canAccessMessageReadStatus(
      profileModel,
      servicePreferenceModel,
      MIN_READ_STATUS_PREFERENCES_VERSION
    )(aServiceId, aFiscalCode)();

    expect(res).toStrictEqual(E.right(false));

    // Do not call service preferences if app version is UNKNOWN
    expect(mockServicePreferencesFind).not.toHaveBeenCalled();
  });

  it("should return true if profile lastAppVersion is = MIN_READ_STATUS_PREFERENCES_VERSION", async () => {
    mockProfileFindLastVersionByModelId.mockReturnValueOnce(
      TE.of(
        O.some({
          ...aRetrievedProfile,
          lastAppVersion: MIN_READ_STATUS_PREFERENCES_VERSION,
          servicePreferencesSettings: autoProfileServicePreferencesSettings
        })
      )
    );

    mockServicePreferencesFind.mockReturnValueOnce(TE.of(O.none));

    const res = await canAccessMessageReadStatus(
      profileModel,
      servicePreferenceModel,
      MIN_READ_STATUS_PREFERENCES_VERSION
    )(aServiceId, aFiscalCode)();

    expect(res).toStrictEqual(E.right(true));

    expect(mockServicePreferencesFind).toHaveBeenCalled();
  });

  it("should return true if profile lastAppVersion is > MIN_READ_STATUS_PREFERENCES_VERSION", async () => {
    mockProfileFindLastVersionByModelId.mockReturnValueOnce(
      TE.of(
        O.some({
          ...aRetrievedProfile,
          lastAppVersion: NEWER_APP_VERSION,
          servicePreferencesSettings: autoProfileServicePreferencesSettings
        })
      )
    );

    mockServicePreferencesFind.mockReturnValueOnce(TE.of(O.none));

    const res = await canAccessMessageReadStatus(
      profileModel,
      servicePreferenceModel,
      MIN_READ_STATUS_PREFERENCES_VERSION
    )(aServiceId, aFiscalCode)();

    expect(res).toStrictEqual(E.right(true));

    expect(mockServicePreferencesFind).toHaveBeenCalled();
  });

  it("should return false if profile lastAppVersion is > MIN_READ_STATUS_PREFERENCES_VERSION and service settings is set to DENY", async () => {
    mockProfileFindLastVersionByModelId.mockReturnValueOnce(
      TE.of(
        O.some({
          ...aRetrievedProfile,
          lastAppVersion: NEWER_APP_VERSION,
          servicePreferencesSettings: autoProfileServicePreferencesSettings
        })
      )
    );

    mockServicePreferencesFind.mockReturnValueOnce(
      TE.of(
        O.some({
          ...aRetrievedServicePreference,
          accessReadMessageStatus: AccessReadMessageStatusEnum.DENY
        })
      )
    );

    const res = await canAccessMessageReadStatus(
      profileModel,
      servicePreferenceModel,
      MIN_READ_STATUS_PREFERENCES_VERSION
    )(aServiceId, aFiscalCode)();

    expect(res).toStrictEqual(E.right(false));

    expect(mockServicePreferencesFind).toHaveBeenCalled();
  });
});

describe("canAccessMessageReadStatus |> Errors", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return an Error if profileModel returns an error", async () => {
    mockProfileFindLastVersionByModelId.mockReturnValueOnce(
      TE.left({} as CosmosErrors)
    );

    const res = await canAccessMessageReadStatus(
      profileModel,
      servicePreferenceModel,
      MIN_READ_STATUS_PREFERENCES_VERSION
    )(aServiceId, aFiscalCode)();

    expect(res).toStrictEqual(
      E.left(Error("Error retrieving user profile from Cosmos DB"))
    );

    // Do not call service preferences if app version is UNKNOWN
    expect(mockServicePreferencesFind).not.toHaveBeenCalled();
  });

  it("should return an Error if profileModel returns O.none", async () => {
    mockProfileFindLastVersionByModelId.mockReturnValueOnce(TE.right(O.none));

    const res = await canAccessMessageReadStatus(
      profileModel,
      servicePreferenceModel,
      MIN_READ_STATUS_PREFERENCES_VERSION
    )(aServiceId, aFiscalCode)();

    expect(res).toStrictEqual(E.left(Error("Profile not found")));

    // Do not call service preferences if app version is UNKNOWN
    expect(mockServicePreferencesFind).not.toHaveBeenCalled();
  });

  it("should return an Error if servicePreferenceModel returns an Error", async () => {
    mockProfileFindLastVersionByModelId.mockReturnValueOnce(
      TE.of(
        O.some({
          ...aRetrievedProfile,
          lastAppVersion: MIN_READ_STATUS_PREFERENCES_VERSION,
          servicePreferencesSettings: autoProfileServicePreferencesSettings
        })
      )
    );

    mockServicePreferencesFind.mockReturnValueOnce(TE.left({} as CosmosErrors));

    const res = await canAccessMessageReadStatus(
      profileModel,
      servicePreferenceModel,
      MIN_READ_STATUS_PREFERENCES_VERSION
    )(aServiceId, aFiscalCode)();

    expect(res).toStrictEqual(
      E.left(Error("Error retrieving user' service preferences from Cosmos DB"))
    );
  });

  it("should return false if profile servicePreferencesSettings is of type LEGACY", async () => {
    mockProfileFindLastVersionByModelId.mockReturnValueOnce(
      TE.of(
        O.some({
          ...aRetrievedProfile,
          lastAppVersion: MIN_READ_STATUS_PREFERENCES_VERSION,
          servicePreferencesSettings: legacyProfileServicePreferencesSettings
        })
      )
    );

    const res = await canAccessMessageReadStatus(
      profileModel,
      servicePreferenceModel,
      MIN_READ_STATUS_PREFERENCES_VERSION
    )(aServiceId, aFiscalCode)();

    expect(res).toStrictEqual(
      E.right(false)
    );

    // Do not call service preferences like if app version is UNKNOWN
    expect(mockServicePreferencesFind).not.toHaveBeenCalled();
  });
});
