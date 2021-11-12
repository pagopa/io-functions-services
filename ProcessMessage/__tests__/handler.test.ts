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

import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

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
import { getProcessMessageHandler } from "../handler";
import { OrganizationFiscalCode } from "@pagopa/ts-commons/lib/strings";
import { Context } from "@azure/functions";
import { MessageStatusModel } from "@pagopa/io-functions-commons/dist/src/models/message_status";

const createContext = (): Context =>
  (({
    bindings: {},
    // eslint-disable no-console
    log: { ...console, verbose: console.log }
  } as unknown) as Context);

const mockTelemetryClient = ({
  trackEvent: jest.fn()
} as unknown) as ReturnType<typeof initTelemetryClient>;

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.some(aRetrievedProfile)));
const lProfileModel = ({
  findLastVersionByModelId: findLastVersionByModelIdMock
} as unknown) as ProfileModel;

const aBlobResult = {
  name: "ABlobName"
};

const storeContentAsBlobMock = jest.fn(() => TE.of(O.some(aBlobResult)));
const upsertMessageMock = jest.fn<any, any>(() => TE.of(aRetrievedMessage));
const lMessageModel = ({
  storeContentAsBlob: storeContentAsBlobMock,
  upsert: upsertMessageMock
} as unknown) as MessageModel;

const findServicePreferenceMock = jest.fn<any, any>(() =>
  TE.of(O.some(aRetrievedServicePreference))
);
const lServicePreferencesModel = ({
  find: findServicePreferenceMock
} as unknown) as ServicesPreferencesModel;

const lMessageStatusModel = ({
  upsert: (...args) => TE.of({} /* anything */)
} as unknown) as MessageStatusModel;

const lastUpdateTimestamp = Math.floor(new Date().getTime() / 1000);
const aFutureOptOutEmailSwitchDate = new Date(lastUpdateTimestamp + 10);

const aPastOptOutEmailSwitchDate = new Date(lastUpdateTimestamp - 10);

const anOrgFiscalCode = "01111111111" as OrganizationFiscalCode;

const aPaymentData = {
  amount: 1000,
  invalid_after_due_date: false,
  notice_number: "177777777777777777"
};

const aPaymentDataWithPayee = {
  ...aPaymentData,
  payee: {
    fiscal_code: anOrgFiscalCode
  }
};

const aCreatedMessageEvent: CreatedMessageEvent = {
  content: aMessageContent,
  message: aNewMessageWithoutContent,
  senderMetadata: aCreatedMessageEventSenderMetadata,
  serviceVersion: 1 as NonNegativeNumber
};
const aMessageContentWithPaymentData = {
  ...aMessageContent,
  payment_data: aPaymentData
};

const aMessageContentWithPaymentDataWithPayee = {
  ...aMessageContent,
  payment_data: aPaymentDataWithPayee
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

describe("getprocessMessageHandler", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it.each`
    scenario                                                                                                                       | profileResult                                                                                               | storageResult  | upsertResult         | preferenceResult                                                    | messageEvent            | expectedBIOC                         | optOutEmailSwitchDate           | optInEmailEnabled | overrideProfileResult
    ${"a retrieved profile mantaining its original isEmailEnabled property"}                                                       | ${aRetrievedProfileWithAValidTimestamp}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(aRetrievedServicePreference)}                              | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"retrieved profile with isEmailEnabled to false"}                                                                            | ${{ ...aRetrievedProfile, isEmailEnabled: false }}                                                          | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(aRetrievedServicePreference)}                              | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"empty blockedInboxOrChannels if message sender service does not exists in user service preference (AUTO SETTINGS)"}         | ${withBlacklist(aRetrievedProfileWithAutoPreferences, [aCreatedMessageEvent.message.senderServiceId])}      | ${aBlobResult} | ${aRetrievedMessage} | ${O.none}                                                           | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"empty blockedInboxOrChannels if message sender service exists and is enabled in user service preference (AUTO SETTINGS)"}   | ${aRetrievedProfileWithAutoPreferences}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(anEnabledServicePreference)}                               | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"a blocked EMAIL if sender service exists and has EMAIL disabled in user service preference (AUTO SETTINGS)"}                | ${withBlacklist(aRetrievedProfileWithAutoPreferences, [aCreatedMessageEvent.message.senderServiceId])}      | ${aBlobResult} | ${aRetrievedMessage} | ${O.some({ ...anEnabledServicePreference, isEmailEnabled: false })} | ${aCreatedMessageEvent} | ${[BlockedInboxOrChannelEnum.EMAIL]} | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"empty blockedInboxOrChannels if message sender service exists and is enabled in user service preference (MANUAL SETTINGS)"} | ${aRetrievedProfileWithManualPreferences}                                                                   | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(anEnabledServicePreference)}                               | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"blocked EMAIL if message sender service exists and has EMAIL disabled in user service preference (MANUAL SETTINGS)"}        | ${aRetrievedProfileWithAutoPreferences}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${O.some({ ...anEnabledServicePreference, isEmailEnabled: false })} | ${aCreatedMessageEvent} | ${[BlockedInboxOrChannelEnum.EMAIL]} | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"blocked EMAIL for a service in blockedInboxOrChannels with email disabled (LEGACY SETTINGS)"}                               | ${withBlockedEmail(aRetrievedProfileWithLegacyPreferences, [aCreatedMessageEvent.message.senderServiceId])} | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                     | ${aCreatedMessageEvent} | ${[BlockedInboxOrChannelEnum.EMAIL]} | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"empty blockedInboxOrChannels if the service is not in user's blockedInboxOrChannels (LEGACY SETTINGS)"}                     | ${withBlacklist(aRetrievedProfileWithLegacyPreferences, ["another-service"])}                               | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                     | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"isEmailEnabled overridden to false if profile's timestamp is before optOutEmailSwitchDate"}                                 | ${aRetrievedProfileWithAValidTimestamp}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                     | ${aCreatedMessageEvent} | ${[]}                                | ${aFutureOptOutEmailSwitchDate} | ${true}           | ${{ ...aRetrievedProfileWithAValidTimestamp, isEmailEnabled: false }}
    ${"isEmailEnabled not overridden if profile's timestamp is after optOutEmailSwitchDate"}                                       | ${aRetrievedProfileWithAValidTimestamp}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                     | ${aCreatedMessageEvent} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${true}           | ${"O.none"}
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
        TE.of(O.some(profileResult))
      );
      storeContentAsBlobMock.mockImplementationOnce(() =>
        TE.of(O.some(storageResult))
      );
      upsertMessageMock.mockImplementationOnce(() =>
        TE.of(O.some(upsertResult))
      );
      !skipPreferenceMock &&
        findServicePreferenceMock.mockImplementationOnce(() =>
          TE.of(preferenceResult)
        );

      const processMessageHandler = getProcessMessageHandler({
        lProfileModel,
        lMessageModel,
        lBlobService: {} as any,
        lServicePreferencesModel,
        lMessageStatusModel,
        optOutEmailSwitchDate,
        isOptInEmailEnabled: optInEmailEnabled,
        telemetryClient: mockTelemetryClient
      });

      const context = createContext();

      await processMessageHandler(context, JSON.stringify(messageEvent));

      const result = context.bindings.processedMessage;

      expect(result.kind).toBe("SUCCESS");
      if (result.kind === "SUCCESS") {
        expect(result.blockedInboxOrChannels).toEqual(expectedBIOC);
        expect(result.profile).toEqual(
          overrideProfileResult === "O.none"
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
    scenario                                           | profileResult                           | storageResult  | upsertResult         | preferenceResult                       | messageEvent                                                                     | optOutEmailSwitchDate         | optInEmailEnabled | expectedMessagePaymentData
    ${"with original payment message with payee"}      | ${aRetrievedProfileWithAValidTimestamp} | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(aRetrievedServicePreference)} | ${{ ...aCreatedMessageEvent, content: aMessageContentWithPaymentDataWithPayee }} | ${aPastOptOutEmailSwitchDate} | ${false}          | ${aPaymentDataWithPayee}
    ${"with overridden payee if no payee is provided"} | ${aRetrievedProfileWithAValidTimestamp} | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(aRetrievedServicePreference)} | ${{ ...aCreatedMessageEvent, content: aMessageContentWithPaymentData }}          | ${aPastOptOutEmailSwitchDate} | ${false}          | ${{ ...aPaymentData, payee: { fiscal_code: aCreatedMessageEvent.senderMetadata.organizationFiscalCode } }}
    ${"with a no payment message"}                     | ${aRetrievedProfileWithAValidTimestamp} | ${aBlobResult} | ${aRetrievedMessage} | ${O.none}                              | ${aCreatedMessageEvent}                                                          | ${aPastOptOutEmailSwitchDate} | ${false}          | ${undefined}
  `(
    "should succeed with $scenario",
    async ({
      profileResult,
      storageResult,
      upsertResult,
      preferenceResult,
      messageEvent,
      optOutEmailSwitchDate,
      optInEmailEnabled,
      expectedMessagePaymentData,
      // mock implementation must be set only if we expect the function to be called, otherwise it will interfere with other tests
      //   we use "not-called" to determine such
      skipPreferenceMock = preferenceResult === "not-called"
    }) => {
      findLastVersionByModelIdMock.mockImplementationOnce(() =>
        TE.of(O.some(profileResult))
      );
      storeContentAsBlobMock.mockImplementationOnce(() =>
        TE.of(O.some(storageResult))
      );
      upsertMessageMock.mockImplementationOnce(() =>
        TE.of(O.some(upsertResult))
      );
      !skipPreferenceMock &&
        findServicePreferenceMock.mockImplementationOnce(() =>
          TE.of(preferenceResult)
        );

      const processMessageHandler = getProcessMessageHandler({
        lProfileModel,
        lMessageModel,
        lBlobService: {} as any,
        lServicePreferencesModel,
        lMessageStatusModel,
        optOutEmailSwitchDate,
        isOptInEmailEnabled: optInEmailEnabled,
        telemetryClient: mockTelemetryClient
      });

      const context = createContext();

      await processMessageHandler(context, JSON.stringify(messageEvent));

      const result = context.bindings.processedMessage;

      expect(result.kind).toBe("SUCCESS");

      const msgEvt = messageEvent as CreatedMessageEvent;
      // success means message has been stored and status has been updated
      expect(storeContentAsBlobMock).toHaveBeenCalledWith(
        {} as any,
        msgEvt.message.id,
        {
          ...msgEvt.content,
          payment_data: expectedMessagePaymentData
        }
      );
    }
  );

  it.each`
    scenario                                                                                               | failureReason              | profileResult                                                                                                    | preferenceResult                                                 | messageEvent
    ${"input cannot be decoded"}                                                                           | ${"BAD_DATA"}              | ${"not-called"}                                                                                                  | ${"not-called"}                                                  | ${{}}
    ${"no profile was found"}                                                                              | ${"PROFILE_NOT_FOUND"}     | ${O.none}                                                                                                        | ${"not-called"}                                                  | ${aCreatedMessageEvent}
    ${"inbox is not enabled"}                                                                              | ${"MASTER_INBOX_DISABLED"} | ${O.some({ ...aRetrievedProfile, isInboxEnabled: false })}                                                       | ${"not-called"}                                                  | ${aCreatedMessageEvent}
    ${"message sender is blocked"}                                                                         | ${"SENDER_BLOCKED"}        | ${O.some(withBlacklist(aRetrievedProfile, [aCreatedMessageEvent.message.senderServiceId]))}                      | ${"not-called"}                                                  | ${aCreatedMessageEvent}
    ${"message sender service exists and is not enabled in user service preference (AUTO SETTINGS)"}       | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithAutoPreferences)}                                                                  | ${O.some(aDisabledServicePreference)}                            | ${aCreatedMessageEvent}
    ${"message sender service exists and has INBOX disabled in user service preference (AUTO SETTINGS)"}   | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithAutoPreferences)}                                                                  | ${O.some({ anEnabledServicePreference, isInboxEnabled: false })} | ${aCreatedMessageEvent}
    ${"message sender service does not exists in user service preference (MANUAL SETTINGS)"}               | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithManualPreferences)}                                                                | ${O.none}                                                        | ${aCreatedMessageEvent}
    ${"message sender service exists and is not enabled in user service preference (MANUAL SETTINGS)"}     | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithManualPreferences)}                                                                | ${O.some(aDisabledServicePreference)}                            | ${aCreatedMessageEvent}
    ${"message sender service exists and has INBOX disabled in user service preference (MANUAL SETTINGS)"} | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithManualPreferences)}                                                                | ${O.some({ anEnabledServicePreference, isInboxEnabled: false })} | ${aCreatedMessageEvent}
    ${"service in blockedInboxOrChannels with blocked INBOX (LEGACY SETTINGS)"}                            | ${"SENDER_BLOCKED"}        | ${O.some(withBlacklist(aRetrievedProfileWithLegacyPreferences, [aCreatedMessageEvent.message.senderServiceId]))} | ${"not-called"}                                                  | ${aCreatedMessageEvent}
  `(
    "should fail if $scenario",
    async ({
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
          return TE.of(profileResult);
        });
      !skipPreferenceMock &&
        findServicePreferenceMock.mockImplementationOnce(() => {
          return TE.of(preferenceResult);
        });
      const processMessageHandler = getProcessMessageHandler({
        lProfileModel,
        lMessageModel,
        lBlobService: {} as any,
        lServicePreferencesModel,
        lMessageStatusModel,
        optOutEmailSwitchDate: aPastOptOutEmailSwitchDate,
        isOptInEmailEnabled: false,
        telemetryClient: mockTelemetryClient
      });

      const context = createContext();

      await processMessageHandler(context, JSON.stringify(messageEvent));

      const result = context.bindings.processedMessage;

      expect(result).toBe(undefined);

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
    scenario                                                         | profileResult                                            | storageResult                                                | upsertResult                                           | preferenceResult                                        | messageEvent
    ${"there is an error while fetching profile"}                    | ${TE.left("Profile fetch error")}                        | ${"not-called"}                                              | ${"not-called"}                                        | ${"not-called"}                                         | ${aCreatedMessageEvent}
    ${"message store operation fails"}                               | ${TE.of(O.some(aRetrievedProfile))}                      | ${TE.left(new Error("Error while storing message content"))} | ${"not-called"}                                        | ${"not-called"}                                         | ${aCreatedMessageEvent}
    ${"message upsert fails"}                                        | ${TE.of(O.some(aRetrievedProfile))}                      | ${TE.of(O.some(aBlobResult))}                                | ${TE.left(new Error("Error while upserting message"))} | ${"not-called"}                                         | ${aCreatedMessageEvent}
    ${"user's service preference retrieval fails (AUTO)"}            | ${TE.of(O.some(aRetrievedProfileWithAutoPreferences))}   | ${"not-called"}                                              | ${"not-called"}                                        | ${TE.left(new Error("Error while reading preference"))} | ${aCreatedMessageEvent}
    ${"user's service preference retrieval fails (MANUAL SETTINGS)"} | ${TE.of(O.some(aRetrievedProfileWithManualPreferences))} | ${"not-called"}                                              | ${"not-called"}                                        | ${TE.left({ kind: "COSMOS_EMPTY_RESPONSE" })}           | ${aCreatedMessageEvent}
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

      const processMessageHandler = getProcessMessageHandler({
        lProfileModel,
        lMessageModel,
        lBlobService: {} as any,
        lServicePreferencesModel,
        lMessageStatusModel,
        optOutEmailSwitchDate: aPastOptOutEmailSwitchDate,
        isOptInEmailEnabled: false,
        telemetryClient: mockTelemetryClient
      });

      const context = createContext();

      await expect(
        processMessageHandler(context, JSON.stringify(aCreatedMessageEvent))
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
