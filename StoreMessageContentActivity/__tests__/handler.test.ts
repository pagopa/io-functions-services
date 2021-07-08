/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { CreatedMessageEvent } from "@pagopa/io-functions-commons/dist/src/models/created_message_event";
import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import { ServicesPreferencesModel } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { UTCISODateFromString } from "@pagopa/ts-commons/lib/dates";
import { NonNegativeNumber } from "@pagopa/ts-commons/lib/numbers";
import { fromLeft } from "fp-ts/lib/IOEither";
import { none, some } from "fp-ts/lib/Option";
import { taskEither } from "fp-ts/lib/TaskEither";
import {
  aCreatedMessageEventSenderMetadata,
  aDisabledServicePreference,
  aMessageContent,
  anEnabledServicePreference,
  aNewMessageWithoutContent,
  aRetrievedMessage,
  aRetrievedProfile,
  aRetrievedServicePreference,
  autoProfileServicePreferencesSettings,
  legacyProfileServicePreferencesSettings,
  manualProfileServicePreferencesSettings
} from "../../__mocks__/mocks";
import { getStoreMessageContentActivityHandler } from "../handler";

const mockContext = {
  // eslint-disable no-console
  log: {
    error: console.error,
    info: console.log,
    verbose: console.log,
    warn: console.warn
  }
} as any;

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(some(aRetrievedProfile)));
const profileModelMock = ({
  findLastVersionByModelId: findLastVersionByModelIdMock
} as unknown) as ProfileModel;

const aBlobResult = {
  name: "ABlobName"
};

const storeContentAsBlobMock = jest.fn(() => taskEither.of(some(aBlobResult)));
const upsertMessageMock = jest.fn<any, any>(() =>
  taskEither.of(aRetrievedMessage)
);
const messageModelMock = {
  storeContentAsBlob: storeContentAsBlobMock,
  upsert: upsertMessageMock
};

const findServicePreferenceMock = jest.fn<any, any>(() =>
  taskEither.of(some(aRetrievedServicePreference))
);
const servicePreferenceMock = ({
  find: findServicePreferenceMock
} as unknown) as ServicesPreferencesModel;

const anOptOutEmailSwitchDate = UTCISODateFromString.decode(
  "2021-07-08T23:59:59Z"
).getOrElseL(() => fail("wrong date value"));

const aPastOptOutEmailSwitchDate = UTCISODateFromString.decode(
  "2000-07-08T23:59:59Z"
).getOrElseL(() => fail("wrong date value"));

const aCreatedMessageEvent: CreatedMessageEvent = {
  content: aMessageContent,
  message: aNewMessageWithoutContent,
  senderMetadata: aCreatedMessageEventSenderMetadata,
  serviceVersion: 1 as NonNegativeNumber
};

const aRetrievedProfileWithAValidTimestamp = {
  ...aRetrievedProfile,
  _ts: 1625172947000
};

const aRetrievedProfileWithLegacyPreferences = {
  ...aRetrievedProfileWithAValidTimestamp,
  servicePreferencesSettings: legacyProfileServicePreferencesSettings
};

const aRetrievedProfileWithManualPreferences = {
  ...aRetrievedProfileWithAValidTimestamp,
  servicePreferencesSettings: manualProfileServicePreferencesSettings
};

const aRetrievedProfileWithAutoPreferences = {
  ...aRetrievedProfileWithAValidTimestamp,
  servicePreferencesSettings: autoProfileServicePreferencesSettings
};

// utility that adds a given set of serviceIds to the profile's inbox blacklist
const withBlacklist = (profile: RetrievedProfile, services = []) => ({
  ...profile,
  blockedInboxOrChannels: services.reduce(
    (obj, serviceId) => ({
      ...obj,
      [serviceId]: [BlockedInboxOrChannelEnum.INBOX]
    }),
    {}
  )
});

const withBlockedEmail = (profile: RetrievedProfile, services = []) => ({
  ...profile,
  blockedInboxOrChannels: services.reduce(
    (obj, serviceId) => ({
      ...obj,
      [serviceId]: [BlockedInboxOrChannelEnum.EMAIL]
    }),
    {}
  )
});
describe("getStoreMessageContentActivityHandler", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it.each`
    scenario                                                                                                                       | profileResult                                                                                               | storageResult  | upsertResult         | preferenceResult                                                  | messageEvent            | expectedBIOC
    ${"a retrieved profile mantaining its original isEmailEnabled property"}                                                       | ${aRetrievedProfileWithAValidTimestamp}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${some(aRetrievedServicePreference)}                              | ${aCreatedMessageEvent} | ${[]}
    ${"retrieved profile with isEmailEnabled to false"}                                                                            | ${{ ...aRetrievedProfile, isEmailEnabled: false }}                                                          | ${aBlobResult} | ${aRetrievedMessage} | ${some(aRetrievedServicePreference)}                              | ${aCreatedMessageEvent} | ${[]}
    ${"empty blockedInboxOrChannels if message sender service does not exists in user service preference (AUTO SETTINGS)"}         | ${withBlacklist(aRetrievedProfileWithAutoPreferences, [aCreatedMessageEvent.message.senderServiceId])}      | ${aBlobResult} | ${aRetrievedMessage} | ${none}                                                           | ${aCreatedMessageEvent} | ${[]}
    ${"empty blockedInboxOrChannels if message sender service exists and is enabled in user service preference (AUTO SETTINGS)"}   | ${aRetrievedProfileWithAutoPreferences}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${some(anEnabledServicePreference)}                               | ${aCreatedMessageEvent} | ${[]}
    ${"a blocked EMAIL if sender service exists and has EMAIL disabled in user service preference (AUTO SETTINGS)"}                | ${withBlacklist(aRetrievedProfileWithAutoPreferences, [aCreatedMessageEvent.message.senderServiceId])}      | ${aBlobResult} | ${aRetrievedMessage} | ${some({ ...anEnabledServicePreference, isEmailEnabled: false })} | ${aCreatedMessageEvent} | ${[BlockedInboxOrChannelEnum.EMAIL]}
    ${"empty blockedInboxOrChannels if message sender service exists and is enabled in user service preference (MANUAL SETTINGS)"} | ${aRetrievedProfileWithManualPreferences}                                                                   | ${aBlobResult} | ${aRetrievedMessage} | ${some(anEnabledServicePreference)}                               | ${aCreatedMessageEvent} | ${[]}
    ${"blocked EMAIL if message sender service exists and has EMAIL disabled in user service preference (MANUAL SETTINGS)"}        | ${aRetrievedProfileWithAutoPreferences}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${some({ ...anEnabledServicePreference, isEmailEnabled: false })} | ${aCreatedMessageEvent} | ${[BlockedInboxOrChannelEnum.EMAIL]}
    ${"blocked EMAIL for a service in blockedInboxOrChannels with email disabled (LEGACY SETTINGS)"}                               | ${withBlockedEmail(aRetrievedProfileWithLegacyPreferences, [aCreatedMessageEvent.message.senderServiceId])} | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                   | ${aCreatedMessageEvent} | ${[BlockedInboxOrChannelEnum.EMAIL]}
    ${"empty blockedInboxOrChannels if the service is not in user's blockedInboxOrChannels (LEGACY SETTINGS)"}                     | ${withBlacklist(aRetrievedProfileWithLegacyPreferences, ["another-service"])}                               | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                   | ${aCreatedMessageEvent} | ${[]}
  `(
    "should succeed with $scenario",
    async ({
      profileResult,
      storageResult,
      upsertResult,
      preferenceResult,
      messageEvent,
      expectedBIOC,
      // mock implementation must be set only if we expect the function to be called, otherwise it will interfere with other tests
      //   we use "not-called" to determine such
      skipPreferenceMock = preferenceResult === "not-called"
    }) => {
      findLastVersionByModelIdMock.mockImplementationOnce(() =>
        taskEither.of(some(profileResult))
      );
      storeContentAsBlobMock.mockImplementationOnce(() =>
        taskEither.of(some(storageResult))
      );
      upsertMessageMock.mockImplementationOnce(() =>
        taskEither.of(some(upsertResult))
      );
      !skipPreferenceMock &&
        findServicePreferenceMock.mockImplementationOnce(() =>
          taskEither.of(preferenceResult)
        );

      const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
        profileModelMock as any,
        messageModelMock as any,
        {} as any,
        servicePreferenceMock,
        aPastOptOutEmailSwitchDate
      );

      const result = await storeMessageContentActivityHandler(
        mockContext,
        messageEvent
      );

      expect(result.kind).toBe("SUCCESS");
      if (result.kind === "SUCCESS") {
        expect(result.blockedInboxOrChannels).toEqual(expectedBIOC);
        expect(result.profile).toEqual(profileResult);
      }

      // success means message has been stored and status has been updated
      expect(upsertMessageMock).toHaveBeenCalledTimes(1);
      expect(storeContentAsBlobMock).toHaveBeenCalledTimes(1);
    }
  );

  it.each`
    scenario                                                                                               | failureReason              | profileResult                                                                                                  | preferenceResult                                               | messageEvent
    ${"activity input cannot be decoded"}                                                                  | ${"BAD_DATA"}              | ${"not-called"}                                                                                                | ${"not-called"}                                                | ${{}}
    ${"no profile was found"}                                                                              | ${"PROFILE_NOT_FOUND"}     | ${none}                                                                                                        | ${"not-called"}                                                | ${aCreatedMessageEvent}
    ${"inbox is not enabled"}                                                                              | ${"MASTER_INBOX_DISABLED"} | ${some({ ...aRetrievedProfile, isInboxEnabled: false })}                                                       | ${"not-called"}                                                | ${aCreatedMessageEvent}
    ${"message sender is blocked"}                                                                         | ${"SENDER_BLOCKED"}        | ${some(withBlacklist(aRetrievedProfile, [aCreatedMessageEvent.message.senderServiceId]))}                      | ${"not-called"}                                                | ${aCreatedMessageEvent}
    ${"message sender service exists and is not enabled in user service preference (AUTO SETTINGS)"}       | ${"SENDER_BLOCKED"}        | ${some(aRetrievedProfileWithAutoPreferences)}                                                                  | ${some(aDisabledServicePreference)}                            | ${aCreatedMessageEvent}
    ${"message sender service exists and has INBOX disabled in user service preference (AUTO SETTINGS)"}   | ${"SENDER_BLOCKED"}        | ${some(aRetrievedProfileWithAutoPreferences)}                                                                  | ${some({ anEnabledServicePreference, isInboxEnabled: false })} | ${aCreatedMessageEvent}
    ${"message sender service does not exists in user service preference (MANUAL SETTINGS)"}               | ${"SENDER_BLOCKED"}        | ${some(aRetrievedProfileWithManualPreferences)}                                                                | ${none}                                                        | ${aCreatedMessageEvent}
    ${"message sender service exists and is not enabled in user service preference (MANUAL SETTINGS)"}     | ${"SENDER_BLOCKED"}        | ${some(aRetrievedProfileWithManualPreferences)}                                                                | ${some(aDisabledServicePreference)}                            | ${aCreatedMessageEvent}
    ${"message sender service exists and has INBOX disabled in user service preference (MANUAL SETTINGS)"} | ${"SENDER_BLOCKED"}        | ${some(aRetrievedProfileWithManualPreferences)}                                                                | ${some({ anEnabledServicePreference, isInboxEnabled: false })} | ${aCreatedMessageEvent}
    ${"service in blockedInboxOrChannels with blocked INBOX (LEGACY SETTINGS)"}                            | ${"SENDER_BLOCKED"}        | ${some(withBlacklist(aRetrievedProfileWithLegacyPreferences, [aCreatedMessageEvent.message.senderServiceId]))} | ${"not-called"}                                                | ${aCreatedMessageEvent}
  `(
    "should fail if $scenario",
    async ({
      failureReason,
      profileResult,
      preferenceResult,
      messageEvent,
      // mock implementation must be set only if we expect the function to be called, otherwise it will interfere with other tests
      //   we use "not-called" to determine such
      skipProfileMock = profileResult === "not-called",
      skipPreferenceMock = preferenceResult === "not-called"
    }) => {
      !skipProfileMock &&
        findLastVersionByModelIdMock.mockImplementationOnce(() => {
          return taskEither.of(profileResult);
        });
      !skipPreferenceMock &&
        findServicePreferenceMock.mockImplementationOnce(() => {
          return taskEither.of(preferenceResult);
        });
      const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
        profileModelMock as any,
        messageModelMock as any,
        {} as any,
        servicePreferenceMock,
        aPastOptOutEmailSwitchDate
      );

      const result = await storeMessageContentActivityHandler(
        mockContext,
        messageEvent
      );

      expect(result.kind).toBe("FAILURE");
      if (result.kind === "FAILURE") {
        expect(result.reason).toEqual(failureReason);
      }

      // check if models are being used only when expected
      expect(findLastVersionByModelIdMock).toBeCalledTimes(
        skipProfileMock ? 0 : 1
      );
      expect(findServicePreferenceMock).toBeCalledTimes(
        skipPreferenceMock ? 0 : 1
      );
    }
  );

  it.each`
    scenario                                                         | profileResult                                                  | storageResult                                                 | upsertResult                                            | preferenceResult                                         | messageEvent
    ${"there is an error while fetching profile"}                    | ${fromLeft("Profile fetch error")}                             | ${"not-called"}                                               | ${"not-called"}                                         | ${"not-called"}                                          | ${aCreatedMessageEvent}
    ${"message store operation fails"}                               | ${taskEither.of(some(aRetrievedProfile))}                      | ${fromLeft(new Error("Error while storing message content"))} | ${"not-called"}                                         | ${"not-called"}                                          | ${aCreatedMessageEvent}
    ${"message upsert fails"}                                        | ${taskEither.of(some(aRetrievedProfile))}                      | ${taskEither.of(some(aBlobResult))}                           | ${fromLeft(new Error("Error while upserting message"))} | ${"not-called"}                                          | ${aCreatedMessageEvent}
    ${"user's service preference retrieval fails (AUTO)"}            | ${taskEither.of(some(aRetrievedProfileWithAutoPreferences))}   | ${"not-called"}                                               | ${"not-called"}                                         | ${fromLeft(new Error("Error while reading preference"))} | ${aCreatedMessageEvent}
    ${"user's service preference retrieval fails (MANUAL SETTINGS)"} | ${taskEither.of(some(aRetrievedProfileWithManualPreferences))} | ${"not-called"}                                               | ${"not-called"}                                         | ${fromLeft({ kind: "COSMOS_EMPTY_RESPONSE" })}           | ${aCreatedMessageEvent}
  `(
    "should throw an Error if $scenario",
    async ({
      profileResult,
      storageResult,
      upsertResult,
      preferenceResult,
      // mock implementation must be set only if we expect the function to be called, otherwise it will interfere with other tests
      //   we use "not-called" to determine such
      skipProfileMock = profileResult === "not-called",
      skipStorageMock = storageResult === "not-called",
      skipUpsertMock = upsertResult === "not-called",
      skipPreferenceMock = preferenceResult === "not-called"
    }) => {
      !skipProfileMock &&
        findLastVersionByModelIdMock.mockImplementationOnce(
          () => profileResult
        );
      !skipStorageMock &&
        storeContentAsBlobMock.mockImplementationOnce(() => storageResult);
      !skipUpsertMock &&
        upsertMessageMock.mockImplementationOnce(() => upsertResult);
      !skipPreferenceMock &&
        findServicePreferenceMock.mockImplementationOnce(
          () => preferenceResult
        );

      const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
        profileModelMock as any,
        messageModelMock as any,
        {} as any,
        servicePreferenceMock,
        aPastOptOutEmailSwitchDate
      );

      await expect(
        storeMessageContentActivityHandler(mockContext, aCreatedMessageEvent)
      ).rejects.toThrow();

      // check if models are being used only when expected
      expect(findLastVersionByModelIdMock).toBeCalledTimes(
        skipProfileMock ? 0 : 1
      );
      expect(storeContentAsBlobMock).toBeCalledTimes(skipStorageMock ? 0 : 1);
      expect(upsertMessageMock).toBeCalledTimes(skipUpsertMock ? 0 : 1);
      expect(findServicePreferenceMock).toBeCalledTimes(
        skipPreferenceMock ? 0 : 1
      );
    }
  );
});
