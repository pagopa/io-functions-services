import * as fc from "fast-check";

import { NonEmptyString } from "italia-ts-commons/lib/strings";

import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";

import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  getLimitedProfileTask,
  isSenderAllowedLegacy,
  retrievedProfileToLimitedProfile
} from "../profile";
import { retrievedProfileArb } from "./arbitraries";
import {
  aFiscalCode,
  anAzureApiAuthorization,
  anAzureUserAttributes,
  anIncompleteService,
  anotherFiscalCode,
  aRetrievedProfile,
  aRetrievedServicePreference,
  autoProfileServicePreferencesSettings,
  legacyProfileServicePreferencesSettings,
  manualProfileServicePreferencesSettings
} from "../../__mocks__/mocks";

import MockResponse from "../../__mocks__/response";

import { ServicesPreferencesModel } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { some, none } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { UserGroup } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";

describe("isSenderAllowed", () => {
  it("should return false if the service is not allowed to send notifications to the user", async () => {
    const blockedInboxOrChannels: RetrievedProfile["blockedInboxOrChannels"] = {
      "01234567890": [BlockedInboxOrChannelEnum.INBOX]
    };

    const result = await isSenderAllowedLegacy(
      blockedInboxOrChannels,
      "01234567890" as NonEmptyString
    ).run();

    result.fold(
      _ => fail("Unexpected failure"),
      isAllowed => {
        expect(isAllowed).toBe(false);
      }
    );
  });

  it("should return true if the service is allowed to send notifications to the user", async () => {
    const blockedInboxOrChannels: RetrievedProfile["blockedInboxOrChannels"] = {};

    const result = await isSenderAllowedLegacy(
      blockedInboxOrChannels,
      "01234567890" as NonEmptyString
    ).run();

    result.fold(
      _ => fail("Unexpected failure"),
      isAllowed => {
        expect(isAllowed).toBe(true);
      }
    );
  });
});

describe("retrievedProfileToLimitedProfile", () => {
  it("should return a LimitedProfile with the right data", () => {
    fc.assert(
      fc.property(
        retrievedProfileArb,
        fc.boolean(),
        (retrived, senderAllowed) => {
          const limitedProfile = retrievedProfileToLimitedProfile(
            retrived,
            senderAllowed
          );
          expect(limitedProfile).toEqual({
            preferred_languages: retrived.preferredLanguages,
            sender_allowed: senderAllowed
          });
        }
      )
    );
  });
});

const aRetrievedProfileWithLegacyPreferences = {
  ...aRetrievedProfile,
  servicePreferencesSettings: legacyProfileServicePreferencesSettings
};

const aRetrievedProfileWithManualPreferences = {
  ...aRetrievedProfile,
  servicePreferencesSettings: manualProfileServicePreferencesSettings
};

const aRetrievedProfileWithAutoPreferences = {
  ...aRetrievedProfile,
  servicePreferencesSettings: autoProfileServicePreferencesSettings
};

const mockProfileFindLast = jest.fn(() =>
  taskEither.of(some(aRetrievedProfileWithLegacyPreferences))
);
const mockProfileModel = ({
  findLastVersionByModelId: mockProfileFindLast
} as unknown) as ProfileModel;

const mockServicePreferenceFind = jest.fn();
const mockServicePreferenceModel = ({
  find: mockServicePreferenceFind
} as unknown) as ServicesPreferencesModel;

// utility that adds a given set of serviceIds to the profile's inbox blacklist
const withBlacklist = (profile: RetrievedProfile, services = []) => ({
  ...profile,
  blockedInboxOrChannels: services.reduce(
    (obj, serviceId) => ({
      ...obj,
      [serviceId]: BlockedInboxOrChannelEnum.INBOX
    }),
    {}
  )
});
describe("getLimitedProfileTask", () => {
  const mockExpresseResponse = MockResponse();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each`
    preferencesConfiguration                           | allowOrNot     | mode        | maybeProfile                                                                                              | maybePreference                                                    | expected
    ${"the inbox is enabled in the preferences"}       | ${"allow"}     | ${"MANUAL"} | ${some(aRetrievedProfileWithManualPreferences)}                                                           | ${some({ ...aRetrievedServicePreference, isInboxEnabled: true })}  | ${true}
    ${"the inbox is enabled in the preferences"}       | ${"allow"}     | ${"AUTO"}   | ${some(aRetrievedProfileWithAutoPreferences)}                                                             | ${some({ ...aRetrievedServicePreference, isInboxEnabled: true })}  | ${true}
    ${"the inbox is NOT enabled in the preferences"}   | ${"not allow"} | ${"MANUAL"} | ${some(aRetrievedProfileWithManualPreferences)}                                                           | ${some({ ...aRetrievedServicePreference, isInboxEnabled: false })} | ${false}
    ${"the inbox is NOT enabled in the preferences"}   | ${"not allow"} | ${"AUTO"}   | ${some(aRetrievedProfileWithAutoPreferences)}                                                             | ${some({ ...aRetrievedServicePreference, isInboxEnabled: false })} | ${false}
    ${"there are not preferences set for the service"} | ${"not allow"} | ${"MANUAL"} | ${some(aRetrievedProfileWithManualPreferences)}                                                           | ${none}                                                            | ${false}
    ${"there are not preferences set for the service"} | ${"allow"}     | ${"AUTO"}   | ${some(aRetrievedProfileWithAutoPreferences)}                                                             | ${none}                                                            | ${true}
    ${"the service is NOT in the blacklist"}           | ${"allow"}     | ${"LEGACY"} | ${some(withBlacklist(aRetrievedProfileWithLegacyPreferences, ["any-service-id"]))}                        | ${none}                                                            | ${true}
    ${"has empty blacklist"}                           | ${"allow"}     | ${"LEGACY"} | ${some(withBlacklist(aRetrievedProfileWithLegacyPreferences, []))}                                        | ${none}                                                            | ${true}
    ${"the service is in the blacklist"}               | ${"not allow"} | ${"LEGACY"} | ${some(withBlacklist(aRetrievedProfileWithLegacyPreferences, [anAzureUserAttributes.service.serviceId]))} | ${none}                                                            | ${false}
  `(
    "should $allowOrNot a sender if the user uses $mode subscription mode and $preferencesConfiguration",
    async ({ maybeProfile, maybePreference, expected }) => {
      mockProfileFindLast.mockImplementationOnce(() =>
        taskEither.of(maybeProfile)
      );
      mockServicePreferenceFind.mockImplementationOnce(() =>
        taskEither.of(maybePreference)
      );

      const result = await getLimitedProfileTask(
        anAzureApiAuthorization,
        anAzureUserAttributes,
        aFiscalCode,
        mockProfileModel,
        false,
        [],
        mockServicePreferenceModel
      ).run();
      result.apply(mockExpresseResponse);

      expect(result.kind).toBe("IResponseSuccessJson");

      expect(mockExpresseResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ sender_allowed: expected })
      );
    }
  );

  it.each`
    title                                                     | responseKind                | maybeProfile
    ${"the requested profile doesn't have the inbox enabled"} | ${"IResponseErrorNotFound"} | ${taskEither.of(some({ ...aRetrievedProfile, isInboxEnabled: false }))}
    ${"the requested profile is not found in the db"}         | ${"IResponseErrorNotFound"} | ${taskEither.of(none)}
    ${"a database error occurs"}                              | ${"IResponseErrorQuery"}    | ${fromLeft({})}
  `(
    "should respond with $responseKind when $title",
    async ({ responseKind, maybeProfile }) => {
      const mockProfileModel = ({
        findLastVersionByModelId: jest.fn(() => maybeProfile)
      } as unknown) as ProfileModel;
      const response = await getLimitedProfileTask(
        {
          ...anAzureApiAuthorization,
          groups: new Set([UserGroup.ApiMessageWrite])
        },
        anAzureUserAttributes,
        aFiscalCode,
        mockProfileModel,
        true,
        [],
        mockServicePreferenceModel
      ).run();

      expect(mockProfileModel.findLastVersionByModelId).toHaveBeenCalledTimes(
        1
      );
      expect(mockProfileModel.findLastVersionByModelId).toBeCalledWith([
        aFiscalCode
      ]);
      expect(response.kind).toBe(responseKind);
    }
  );

  it.each`
    title                                              | groups                                | service
    ${"the service hasn't the required quality field"} | ${[UserGroup.ApiMessageWrite]}        | ${anIncompleteService}
    ${"the service is sandboxed"}                      | ${[UserGroup.ApiLimitedMessageWrite]} | ${anAzureUserAttributes.service}
  `(
    "should respond with 403 IResponseErrorForbiddenNotAuthorizedForRecipient when $title",
    async ({ groups, service }) => {
      const mockProfileModel = ({
        findLastVersionByModelId: jest.fn(() =>
          taskEither.of(some(aRetrievedProfile))
        )
      } as unknown) as ProfileModel;
      const response = await getLimitedProfileTask(
        {
          ...anAzureApiAuthorization,
          groups: new Set(groups)
        },
        {
          ...anAzureUserAttributes,
          service: {
            ...service,
            // note that we're not including aFiscalCode in the allowed recipients
            authorizedRecipients: new Set([anotherFiscalCode])
          }
        },
        aFiscalCode,
        mockProfileModel,
        true,
        [],
        mockServicePreferenceModel
      ).run();

      expect(mockProfileModel.findLastVersionByModelId).not.toHaveBeenCalled();

      expect(response.kind).toBe(
        "IResponseErrorForbiddenNotAuthorizedForRecipient"
      );
    }
  );
});
