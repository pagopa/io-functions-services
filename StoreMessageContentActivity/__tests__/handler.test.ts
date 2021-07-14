/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { CreatedMessageEvent } from "@pagopa/io-functions-commons/dist/src/models/created_message_event";
import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import { ServicesPreferencesModel } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { NonNegativeNumber } from "@pagopa/ts-commons/lib/numbers";
import { isBefore } from "date-fns";
import { fromLeft } from "fp-ts/lib/IOEither";
import { none, some } from "fp-ts/lib/Option";
import { taskEither } from "fp-ts/lib/TaskEither";
import { initTelemetryClient } from "../../utils/appinsights";
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

const mockTelemetryClient = ({
  trackEvent: jest.fn()
} as unknown) as ReturnType<typeof initTelemetryClient>;

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(some(aRetrievedProfile)));
const lProfileModel = ({
  findLastVersionByModelId: findLastVersionByModelIdMock
} as unknown) as ProfileModel;

const aBlobResult = {
  name: "ABlobName"
};

const storeContentAsBlobMock = jest.fn(() => taskEither.of(some(aBlobResult)));
const upsertMessageMock = jest.fn<any, any>(() =>
  taskEither.of(aRetrievedMessage)
);
const lMessageModel = ({
  storeContentAsBlob: storeContentAsBlobMock,
  upsert: upsertMessageMock
} as unknown) as MessageModel;

const findServicePreferenceMock = jest.fn<any, any>(() =>
  taskEither.of(some(aRetrievedServicePreference))
);
const lServicePreferencesModel = ({
  find: findServicePreferenceMock
} as unknown) as ServicesPreferencesModel;

const lastUpdateTimestamp = Math.floor(new Date().getTime() / 1000);
const aFutureOptOutEmailSwitchDate = new Date(lastUpdateTimestamp + 10);

const aPastOptOutEmailSwitchDate = new Date(lastUpdateTimestamp - 10);

const aCreatedMessageEvent: CreatedMessageEvent = {
  content: aMessageContent,
  message: aNewMessageWithoutContent,
  senderMetadata: aCreatedMessageEventSenderMetadata,
  serviceVersion: 1 as NonNegativeNumber
};

const aRetrievedProfileWithAValidTimestamp = {
  ...aRetrievedProfile,
  _ts: lastUpdateTimestamp
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
    scenario                                                                                                                       | profileResult                                                                                               | storageResult  | upsertResult         | preferenceResult                                                  | messageEvent            | expectedBIOC                         | optOutEmailSwitchDate           | optInEmailEnabled | overrideProfileResult
    ${"a retrieved profile mantaining its original isEmailEnabled property"}                                                       | ${aRetrievedProfileWithAValidTimestamp}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${some(aRetrievedServicePreference)}                              | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"none"}
    ${"retrieved profile with isEmailEnabled to false"}                                                                            | ${{ ...aRetrievedProfile, isEmailEnabled: false }}                                                          | ${aBlobResult} | ${aRetrievedMessage} | ${some(aRetrievedServicePreference)}                              | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"none"}
    ${"empty blockedInboxOrChannels if message sender service does not exists in user service preference (AUTO SETTINGS)"}         | ${withBlacklist(aRetrievedProfileWithAutoPreferences, [aCreatedMessageEvent.message.senderServiceId])}      | ${aBlobResult} | ${aRetrievedMessage} | ${none}                                                           | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"none"}
    ${"empty blockedInboxOrChannels if message sender service exists and is enabled in user service preference (AUTO SETTINGS)"}   | ${aRetrievedProfileWithAutoPreferences}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${some(anEnabledServicePreference)}                               | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"none"}
    ${"a blocked EMAIL if sender service exists and has EMAIL disabled in user service preference (AUTO SETTINGS)"}                | ${withBlacklist(aRetrievedProfileWithAutoPreferences, [aCreatedMessageEvent.message.senderServiceId])}      | ${aBlobResult} | ${aRetrievedMessage} | ${some({ ...anEnabledServicePreference, isEmailEnabled: false })} | ${aCreatedMessageEvent} | ${[BlockedInboxOrChannelEnum.EMAIL]} | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"none"}
    ${"empty blockedInboxOrChannels if message sender service exists and is enabled in user service preference (MANUAL SETTINGS)"} | ${aRetrievedProfileWithManualPreferences}                                                                   | ${aBlobResult} | ${aRetrievedMessage} | ${some(anEnabledServicePreference)}                               | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"none"}
    ${"blocked EMAIL if message sender service exists and has EMAIL disabled in user service preference (MANUAL SETTINGS)"}        | ${aRetrievedProfileWithAutoPreferences}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${some({ ...anEnabledServicePreference, isEmailEnabled: false })} | ${aCreatedMessageEvent} | ${[BlockedInboxOrChannelEnum.EMAIL]} | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"none"}
    ${"blocked EMAIL for a service in blockedInboxOrChannels with email disabled (LEGACY SETTINGS)"}                               | ${withBlockedEmail(aRetrievedProfileWithLegacyPreferences, [aCreatedMessageEvent.message.senderServiceId])} | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                   | ${aCreatedMessageEvent} | ${[BlockedInboxOrChannelEnum.EMAIL]} | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"none"}
    ${"empty blockedInboxOrChannels if the service is not in user's blockedInboxOrChannels (LEGACY SETTINGS)"}                     | ${withBlacklist(aRetrievedProfileWithLegacyPreferences, ["another-service"])}                               | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                   | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"none"}
    ${"isEmailEnabled overridden to false if profile's timestamp is before optOutEmailSwitchDate"}                                 | ${aRetrievedProfileWithAValidTimestamp}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                   | ${aCreatedMessageEvent} | ${[]}                                | ${aFutureOptOutEmailSwitchDate} | ${true}           | ${{ ...aRetrievedProfileWithAValidTimestamp, isEmailEnabled: false }}
    ${"isEmailEnabled not overridden if profile's timestamp is after optOutEmailSwitchDate"}                                       | ${aRetrievedProfileWithAValidTimestamp}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                   | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${true}           | ${"none"}
  `(
    "should succeed with $scenario",
    async ({
      profileResult,
      storageResult,
      upsertResult,
      preferenceResult,
      messageEvent,
      expectedBIOC,
      optOutEmailSwitchDate,
      optInEmailEnabled,
      overrideProfileResult,
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
        {
          lProfileModel,
          lMessageModel,
          lBlobService: {} as any,
          lServicePreferencesModel,
          optOutEmailSwitchDate,
          isOptInEmailEnabled: optInEmailEnabled,
          telemetryClient: mockTelemetryClient
        }
      );

      const result = await storeMessageContentActivityHandler(
        mockContext,
        messageEvent
      );

      expect(result.kind).toBe("SUCCESS");
      if (result.kind === "SUCCESS") {
        expect(result.blockedInboxOrChannels).toEqual(expectedBIOC);
        expect(result.profile).toEqual(
          overrideProfileResult === "none"
            ? profileResult
            : overrideProfileResult
        );
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
        {
          lProfileModel,
          lMessageModel,
          lBlobService: {} as any,
          lServicePreferencesModel,
          optOutEmailSwitchDate: aPastOptOutEmailSwitchDate,
          isOptInEmailEnabled: false,
          telemetryClient: mockTelemetryClient
        }
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
        {
          lProfileModel,
          lMessageModel,
          lBlobService: {} as any,
          lServicePreferencesModel,
          optOutEmailSwitchDate: aPastOptOutEmailSwitchDate,
          isOptInEmailEnabled: false,
          telemetryClient: mockTelemetryClient
        }
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
