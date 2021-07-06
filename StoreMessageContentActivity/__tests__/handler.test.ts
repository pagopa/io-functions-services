/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { CreatedMessageEvent } from "@pagopa/io-functions-commons/dist/src/models/created_message_event";
import { UTCISODateFromString } from "@pagopa/ts-commons/lib/dates";
import {
  NonNegativeInteger,
  NonNegativeNumber
} from "@pagopa/ts-commons/lib/numbers";
import { fromLeft } from "fp-ts/lib/IOEither";
import { none, some, Option } from "fp-ts/lib/Option";
import { taskEither } from "fp-ts/lib/TaskEither";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  makeServicesPreferencesDocumentId,
  ServicePreference
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { ServicesPreferencesModel } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import {
  aCreatedMessageEventSenderMetadata,
  aDisabledServicePreference,
  aMessageContent,
  anEnabledServicePreference,
  aNewMessageWithoutContent,
  aRetrievedMessage,
  aRetrievedProfile,
  autoProfileServicePreferencesSettings,
  legacyProfileServicePreferencesSettings,
  manualProfileServicePreferencesSettings
} from "../../__mocks__/mocks";
import {
  getStoreMessageContentActivityHandler,
  StoreMessageContentActivityResult
} from "../handler";
import { NonEmptyString } from "@pagopa/io-functions-commons/node_modules/@pagopa/ts-commons/lib/strings";

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

const profileModelMock = {
  findLastVersionByModelId: jest.fn(findLastVersionByModelIdMock)
};

const aBlobResult = {
  name: "ABlobName"
};

const storeContentAsBlobMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(some(aBlobResult)));

const upsertMessageMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(aRetrievedMessage));

const messageModelMock = {
  storeContentAsBlob: jest.fn(storeContentAsBlobMock),
  upsert: jest.fn(upsertMessageMock)
};

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

const findServicePreferenceMock = jest
  .fn()
  .mockImplementation(([modelId, partitionKey]) =>
    taskEither.of<CosmosErrors, Option<ServicePreference>>(none)
  );

const mockServicesPreferencesModel = ({
  find: findServicePreferenceMock
} as any) as ServicesPreferencesModel;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getStoreMessageContentActivityHandler", () => {
  it("should respond success with a retrieved profile with isEmailEnabled to false", async () => {
    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      {} as any,
      // limit date is after profile timestamp
      anOptOutEmailSwitchDate
    );

    const result = await storeMessageContentActivityHandler(
      mockContext,
      aCreatedMessageEvent
    );

    expect(result.kind).toBe("SUCCESS");
    if (result.kind === "SUCCESS") {
      expect(result.blockedInboxOrChannels).toEqual([]);
      expect(result.profile).toEqual({
        ...aRetrievedProfile,
        isEmailEnabled: false
      });
    }
  });

  it("should respond success with a retrieved profile mantaining its original isEmailEnabled property", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some(aRetrievedProfileWithAValidTimestamp))
    );
    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      {} as any,
      // limit date is before profile timestamp
      aPastOptOutEmailSwitchDate
    );

    const result = await storeMessageContentActivityHandler(
      mockContext,
      aCreatedMessageEvent
    );

    expect(result.kind).toBe("SUCCESS");
    if (result.kind === "SUCCESS") {
      expect(result.blockedInboxOrChannels).toEqual([]);
      expect(result.profile).toEqual(aRetrievedProfileWithAValidTimestamp);
    }
  });

  it("should fail if activity input cannot be decoded", async () => {
    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      {} as any,
      aPastOptOutEmailSwitchDate
    );

    const result = await storeMessageContentActivityHandler(
      mockContext,
      {} as any
    );

    expect(result.kind).toBe("FAILURE");
    if (result.kind === "FAILURE") {
      expect(result.reason).toEqual("BAD_DATA");
    }
  });

  it("should throw an Error if there is an error while fetching profile", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      fromLeft("Profile fetch error")
    );
    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      {} as any,
      aPastOptOutEmailSwitchDate
    );

    await expect(
      storeMessageContentActivityHandler(mockContext, aCreatedMessageEvent)
    ).rejects.toThrow();
  });

  it("should return a failure if no profile was found", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      {} as any,
      aPastOptOutEmailSwitchDate
    );

    const result = await storeMessageContentActivityHandler(
      mockContext,
      aCreatedMessageEvent
    );

    expect(result.kind).toBe("FAILURE");
    if (result.kind === "FAILURE") {
      expect(result.reason).toEqual("PROFILE_NOT_FOUND");
    }
  });

  it("should return a failure if inbox is not enabled", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(some({ ...aRetrievedProfile, isInboxEnabled: false }))
    );
    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      {} as any,
      aPastOptOutEmailSwitchDate
    );

    const result = await storeMessageContentActivityHandler(
      mockContext,
      aCreatedMessageEvent
    );

    expect(result.kind).toBe("FAILURE");
    if (result.kind === "FAILURE") {
      expect(result.reason).toEqual("MASTER_INBOX_DISABLED");
    }
  });

  it("should return a failure if message sender is blocked", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aRetrievedProfile,
          blockedInboxOrChannels: {
            myService: [BlockedInboxOrChannelEnum.INBOX]
          }
        })
      )
    );
    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      {} as any,
      aPastOptOutEmailSwitchDate
    );

    const result = await storeMessageContentActivityHandler(mockContext, {
      ...aCreatedMessageEvent,
      message: {
        ...aNewMessageWithoutContent,
        senderServiceId: "myService" as ServiceId
      }
    });

    expect(result.kind).toBe("FAILURE");
    if (result.kind === "FAILURE") {
      expect(result.reason).toEqual("SENDER_BLOCKED");
    }
  });

  it("should throw an Error if message store operation fails", async () => {
    storeContentAsBlobMock.mockImplementationOnce(() =>
      fromLeft(new Error("Error while storing message content"))
    );
    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      {} as any,
      aPastOptOutEmailSwitchDate
    );

    await expect(
      storeMessageContentActivityHandler(mockContext, aCreatedMessageEvent)
    ).rejects.toThrow();
  });

  it("should throw an Error if message upsert fails", async () => {
    upsertMessageMock.mockImplementationOnce(() =>
      fromLeft(new Error("Error while upserting message"))
    );
    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      {} as any,
      aPastOptOutEmailSwitchDate
    );

    await expect(
      storeMessageContentActivityHandler(mockContext, aCreatedMessageEvent)
    ).rejects.toThrow();
  });

  it("should throw an Error if user's service preference retrieval fails (AUTO SETTINGS)", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aRetrievedProfile,
          servicePreferencesSettings: autoProfileServicePreferencesSettings,
          blockedInboxOrChannels: {
            "01234567890": [BlockedInboxOrChannelEnum.INBOX]
          }
        })
      )
    );

    findServicePreferenceMock.mockImplementationOnce(
      ([modelId, partitionKey]) =>
        fromLeft({ kind: "COSMOSDB|ERROR=Any DB error that can occur" })
    );

    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      mockServicesPreferencesModel as any,
      aPastOptOutEmailSwitchDate
    );

    await expect(
      storeMessageContentActivityHandler(mockContext, aCreatedMessageEvent)
    ).rejects.toThrow();

    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
    expect(findLastVersionByModelIdMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalledWith([
      aRetrievedProfile.fiscalCode
    ]);

    const documentId = makeServicesPreferencesDocumentId(
      aRetrievedProfile.fiscalCode,
      aCreatedMessageEvent.message.senderServiceId,
      autoProfileServicePreferencesSettings.version as NonNegativeInteger
    );
    expect(findServicePreferenceMock).toHaveBeenCalled();
    expect(findServicePreferenceMock).toHaveBeenCalledTimes(1);
    expect(findServicePreferenceMock).toHaveBeenCalledWith([
      documentId,
      aRetrievedProfile.fiscalCode
    ]);
  });

  it("should throw an Error if user's service preference retrieval fails (MANUAL SETTINGS)", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aRetrievedProfile,
          servicePreferencesSettings: manualProfileServicePreferencesSettings,
          blockedInboxOrChannels: {
            "01234567890": [BlockedInboxOrChannelEnum.INBOX]
          }
        })
      )
    );

    findServicePreferenceMock.mockImplementationOnce(
      ([modelId, partitionKey]) =>
        fromLeft({ kind: "COSMOSDB|ERROR=Any DB error that can occur" })
    );

    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      mockServicesPreferencesModel as any,
      aPastOptOutEmailSwitchDate
    );

    await expect(
      storeMessageContentActivityHandler(mockContext, aCreatedMessageEvent)
    ).rejects.toThrow();

    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
    expect(findLastVersionByModelIdMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalledWith([
      aRetrievedProfile.fiscalCode
    ]);

    const documentId = makeServicesPreferencesDocumentId(
      aRetrievedProfile.fiscalCode,
      aCreatedMessageEvent.message.senderServiceId,
      manualProfileServicePreferencesSettings.version as NonNegativeInteger
    );
    expect(findServicePreferenceMock).toHaveBeenCalled();
    expect(findServicePreferenceMock).toHaveBeenCalledTimes(1);
    expect(findServicePreferenceMock).toHaveBeenCalledWith([
      documentId,
      aRetrievedProfile.fiscalCode
    ]);
  });

  it("should not throw if user's service preference retrieval fails (LEGACY SETTINGS)", async () => {
    // LEGACY settings should not run any query on service preferences
    // so this should not throw any error because query is not run

    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aRetrievedProfile,
          servicePreferencesSettings: legacyProfileServicePreferencesSettings,
          blockedInboxOrChannels: {
            ASDFGHJKL: [BlockedInboxOrChannelEnum.INBOX]
          }
        })
      )
    );

    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      mockServicesPreferencesModel as any,
      aPastOptOutEmailSwitchDate
    );

    const result: StoreMessageContentActivityResult = await storeMessageContentActivityHandler(
      mockContext,
      {
        ...aCreatedMessageEvent,
        message: {
          ...aNewMessageWithoutContent,
          senderServiceId: "01234567890" as ServiceId
        }
      }
    );

    expect(result.kind).toBe("SUCCESS");
    if (result.kind === "SUCCESS") {
      expect(result.blockedInboxOrChannels).toEqual([]);
    }

    // findServicePreferenceMock is not mocked because it should not be called
    // senderServiceId: "01234567890" is not in blockedInboxOrChannels
    // => SUCCESS
    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
    expect(findLastVersionByModelIdMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalledWith([
      aRetrievedProfile.fiscalCode
    ]);
    expect(findServicePreferenceMock).not.toHaveBeenCalled();
  });

  it("should return a success if message sender service does not exists in user service preference (AUTO SETTINGS)", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aRetrievedProfile,
          servicePreferencesSettings: autoProfileServicePreferencesSettings,
          blockedInboxOrChannels: {
            "01234567890": [BlockedInboxOrChannelEnum.INBOX]
          }
        })
      )
    );

    findServicePreferenceMock.mockImplementationOnce(
      ([modelId, partitionKey]) =>
        taskEither.of<CosmosErrors, Option<ServicePreference>>(none)
    );

    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      mockServicesPreferencesModel as any,
      aPastOptOutEmailSwitchDate
    );

    const result: StoreMessageContentActivityResult = await storeMessageContentActivityHandler(
      mockContext,
      {
        ...aCreatedMessageEvent,
        message: {
          ...aNewMessageWithoutContent,
          senderServiceId: "01234567890" as ServiceId
        }
      }
    );

    expect(result.kind).toBe("SUCCESS");
    if (result.kind === "SUCCESS") {
      expect(result.blockedInboxOrChannels).toEqual([
        BlockedInboxOrChannelEnum.INBOX
      ]);
    }

    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
    expect(findLastVersionByModelIdMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalledWith([
      aRetrievedProfile.fiscalCode
    ]);

    const documentId = makeServicesPreferencesDocumentId(
      aRetrievedProfile.fiscalCode,
      "01234567890" as NonEmptyString,
      autoProfileServicePreferencesSettings.version as NonNegativeInteger
    );
    expect(findServicePreferenceMock).toHaveBeenCalled();
    expect(findServicePreferenceMock).toHaveBeenCalledTimes(1);
    expect(findServicePreferenceMock).toHaveBeenCalledWith([
      documentId,
      aRetrievedProfile.fiscalCode
    ]);
  });

  it("should return a success if message sender service exists and is enabled in user service preference (AUTO SETTINGS)", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aRetrievedProfile,
          servicePreferencesSettings: autoProfileServicePreferencesSettings,
          blockedInboxOrChannels: {
            "01234567890": [BlockedInboxOrChannelEnum.INBOX]
          }
        })
      )
    );

    findServicePreferenceMock.mockImplementationOnce(
      ([modelId, partitionKey]) =>
        taskEither.of<CosmosErrors, Option<ServicePreference>>(
          some({
            ...anEnabledServicePreference,
            version: autoProfileServicePreferencesSettings.version
          })
        )
    );

    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      mockServicesPreferencesModel as any,
      aPastOptOutEmailSwitchDate
    );

    const result: StoreMessageContentActivityResult = await storeMessageContentActivityHandler(
      mockContext,
      {
        ...aCreatedMessageEvent,
        message: {
          ...aNewMessageWithoutContent,
          senderServiceId: "01234567890" as ServiceId
        }
      }
    );

    expect(result.kind).toBe("SUCCESS");
    if (result.kind === "SUCCESS") {
      expect(result.blockedInboxOrChannels).toEqual([
        BlockedInboxOrChannelEnum.INBOX
      ]);
    }

    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
    expect(findLastVersionByModelIdMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalledWith([
      aRetrievedProfile.fiscalCode
    ]);

    const documentId = makeServicesPreferencesDocumentId(
      aRetrievedProfile.fiscalCode,
      "01234567890" as NonEmptyString,
      autoProfileServicePreferencesSettings.version as NonNegativeInteger
    );
    expect(findServicePreferenceMock).toHaveBeenCalled();
    expect(findServicePreferenceMock).toHaveBeenCalledTimes(1);
    expect(findServicePreferenceMock).toHaveBeenCalledWith([
      documentId,
      aRetrievedProfile.fiscalCode
    ]);
  });

  it("should return a failure if message sender service exists and is not enabled in user service preference (AUTO SETTINGS)", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aRetrievedProfile,
          servicePreferencesSettings: autoProfileServicePreferencesSettings,
          blockedInboxOrChannels: {
            "01234567890": [BlockedInboxOrChannelEnum.INBOX]
          }
        })
      )
    );

    findServicePreferenceMock.mockImplementationOnce(
      ([modelId, partitionKey]) =>
        taskEither.of<CosmosErrors, Option<ServicePreference>>(
          some({
            ...aDisabledServicePreference,
            version: autoProfileServicePreferencesSettings.version
          })
        )
    );

    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      mockServicesPreferencesModel as any,
      aPastOptOutEmailSwitchDate
    );

    const result: StoreMessageContentActivityResult = await storeMessageContentActivityHandler(
      mockContext,
      {
        ...aCreatedMessageEvent,
        message: {
          ...aNewMessageWithoutContent,
          senderServiceId: "01234567890" as ServiceId
        }
      }
    );

    expect(result.kind).toBe("FAILURE");
    if (result.kind === "FAILURE") {
      expect(result.reason).toEqual("SENDER_BLOCKED");
    }

    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
    expect(findLastVersionByModelIdMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalledWith([
      aRetrievedProfile.fiscalCode
    ]);

    const documentId = makeServicesPreferencesDocumentId(
      aRetrievedProfile.fiscalCode,
      "01234567890" as NonEmptyString,
      autoProfileServicePreferencesSettings.version as NonNegativeInteger
    );
    expect(findServicePreferenceMock).toHaveBeenCalled();
    expect(findServicePreferenceMock).toHaveBeenCalledTimes(1);
    expect(findServicePreferenceMock).toHaveBeenCalledWith([
      documentId,
      aRetrievedProfile.fiscalCode
    ]);
  });

  it("should return a failure if message sender service does not exists in user service preference (MANUAL SETTINGS)", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aRetrievedProfile,
          servicePreferencesSettings: manualProfileServicePreferencesSettings,
          blockedInboxOrChannels: {
            "01234567890": [BlockedInboxOrChannelEnum.INBOX]
          }
        })
      )
    );

    findServicePreferenceMock.mockImplementationOnce(
      ([modelId, partitionKey]) =>
        taskEither.of<CosmosErrors, Option<ServicePreference>>(none)
    );

    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      mockServicesPreferencesModel as any,
      aPastOptOutEmailSwitchDate
    );

    const result: StoreMessageContentActivityResult = await storeMessageContentActivityHandler(
      mockContext,
      {
        ...aCreatedMessageEvent,
        message: {
          ...aNewMessageWithoutContent,
          senderServiceId: "01234567890" as ServiceId
        }
      }
    );

    expect(result.kind).toBe("FAILURE");
    if (result.kind === "FAILURE") {
      expect(result.reason).toEqual("SENDER_BLOCKED");
    }

    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
    expect(findLastVersionByModelIdMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalledWith([
      aRetrievedProfile.fiscalCode
    ]);

    const documentId = makeServicesPreferencesDocumentId(
      aRetrievedProfile.fiscalCode,
      "01234567890" as NonEmptyString,
      manualProfileServicePreferencesSettings.version as NonNegativeInteger
    );
    expect(findServicePreferenceMock).toHaveBeenCalled();
    expect(findServicePreferenceMock).toHaveBeenCalledTimes(1);
    expect(findServicePreferenceMock).toHaveBeenCalledWith([
      documentId,
      aRetrievedProfile.fiscalCode
    ]);
  });

  it("should return a success if message sender service exists and is enabled in user service preference (MANUAL SETTINGS)", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aRetrievedProfile,
          servicePreferencesSettings: manualProfileServicePreferencesSettings,
          blockedInboxOrChannels: {
            "01234567890": [BlockedInboxOrChannelEnum.INBOX]
          }
        })
      )
    );

    findServicePreferenceMock.mockImplementationOnce(
      ([modelId, partitionKey]) =>
        taskEither.of<CosmosErrors, Option<ServicePreference>>(
          some({
            ...anEnabledServicePreference,
            version: manualProfileServicePreferencesSettings.version
          })
        )
    );

    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      mockServicesPreferencesModel as any,
      aPastOptOutEmailSwitchDate
    );

    const result: StoreMessageContentActivityResult = await storeMessageContentActivityHandler(
      mockContext,
      {
        ...aCreatedMessageEvent,
        message: {
          ...aNewMessageWithoutContent,
          senderServiceId: "01234567890" as ServiceId
        }
      }
    );

    expect(result.kind).toBe("SUCCESS");
    if (result.kind === "SUCCESS") {
      expect(result.blockedInboxOrChannels).toEqual([
        BlockedInboxOrChannelEnum.INBOX
      ]);
    }

    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
    expect(findLastVersionByModelIdMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalledWith([
      aRetrievedProfile.fiscalCode
    ]);

    const documentId = makeServicesPreferencesDocumentId(
      aRetrievedProfile.fiscalCode,
      "01234567890" as NonEmptyString,
      manualProfileServicePreferencesSettings.version as NonNegativeInteger
    );
    expect(findServicePreferenceMock).toHaveBeenCalled();
    expect(findServicePreferenceMock).toHaveBeenCalledTimes(1);
    expect(findServicePreferenceMock).toHaveBeenCalledWith([
      documentId,
      aRetrievedProfile.fiscalCode
    ]);
  });

  it("should return a failure if message sender service exists and is not enabled in user service preference (MANUAL SETTINGS)", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aRetrievedProfile,
          servicePreferencesSettings: manualProfileServicePreferencesSettings,
          blockedInboxOrChannels: {
            "01234567890": [BlockedInboxOrChannelEnum.INBOX]
          }
        })
      )
    );

    findServicePreferenceMock.mockImplementationOnce(
      ([modelId, partitionKey]) =>
        taskEither.of<CosmosErrors, Option<ServicePreference>>(
          some({
            ...aDisabledServicePreference,
            version: manualProfileServicePreferencesSettings.version
          })
        )
    );

    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      mockServicesPreferencesModel as any,
      aPastOptOutEmailSwitchDate
    );

    const result: StoreMessageContentActivityResult = await storeMessageContentActivityHandler(
      mockContext,
      {
        ...aCreatedMessageEvent,
        message: {
          ...aNewMessageWithoutContent,
          senderServiceId: "01234567890" as ServiceId
        }
      }
    );

    expect(result.kind).toBe("FAILURE");
    if (result.kind === "FAILURE") {
      expect(result.reason).toEqual("SENDER_BLOCKED");
    }

    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
    expect(findLastVersionByModelIdMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalledWith([
      aRetrievedProfile.fiscalCode
    ]);

    const documentId = makeServicesPreferencesDocumentId(
      aRetrievedProfile.fiscalCode,
      "01234567890" as NonEmptyString,
      manualProfileServicePreferencesSettings.version as NonNegativeInteger
    );
    expect(findServicePreferenceMock).toHaveBeenCalled();
    expect(findServicePreferenceMock).toHaveBeenCalledTimes(1);
    expect(findServicePreferenceMock).toHaveBeenCalledWith([
      documentId,
      aRetrievedProfile.fiscalCode
    ]);
  });

  it("should return a failure if message sender service exists in profile.blockedInboxOrChannels (LEGACY SETTINGS)", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aRetrievedProfile,
          servicePreferencesSettings: legacyProfileServicePreferencesSettings,
          blockedInboxOrChannels: {
            "01234567890": [BlockedInboxOrChannelEnum.INBOX]
          }
        })
      )
    );

    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      mockServicesPreferencesModel as any,
      aPastOptOutEmailSwitchDate
    );

    const result: StoreMessageContentActivityResult = await storeMessageContentActivityHandler(
      mockContext,
      {
        ...aCreatedMessageEvent,
        message: {
          ...aNewMessageWithoutContent,
          senderServiceId: "01234567890" as ServiceId
        }
      }
    );

    expect(result.kind).toBe("FAILURE");
    if (result.kind === "FAILURE") {
      expect(result.reason).toEqual("SENDER_BLOCKED");
    }

    // findServicePreferenceMock is not mocked because it should not be called
    // senderServiceId: "01234567890" is in blockedInboxOrChannels
    // => FAILURE
    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
    expect(findLastVersionByModelIdMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalledWith([
      aRetrievedProfile.fiscalCode
    ]);
    expect(findServicePreferenceMock).not.toHaveBeenCalled();
  });

  it("should return a success if message sender service does not exists in profile.blockedInboxOrChannels (LEGACY SETTINGS)", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aRetrievedProfile,
          servicePreferencesSettings: legacyProfileServicePreferencesSettings,
          blockedInboxOrChannels: {
            anotherService: [BlockedInboxOrChannelEnum.INBOX]
          }
        })
      )
    );

    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      mockServicesPreferencesModel as any,
      aPastOptOutEmailSwitchDate
    );

    const result: StoreMessageContentActivityResult = await storeMessageContentActivityHandler(
      mockContext,
      {
        ...aCreatedMessageEvent,
        message: {
          ...aNewMessageWithoutContent,
          senderServiceId: "01234567890" as ServiceId
        }
      }
    );

    expect(result.kind).toBe("SUCCESS");
    if (result.kind === "SUCCESS") {
      expect(result.blockedInboxOrChannels).toEqual([]);
    }

    // findServicePreferenceMock is not mocked because it should not be called
    // senderServiceId: "01234567890" is not in blockedInboxOrChannels
    // => SUCCESS
    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
    expect(findLastVersionByModelIdMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalledWith([
      aRetrievedProfile.fiscalCode
    ]);
    expect(findServicePreferenceMock).not.toHaveBeenCalled();
  });
});
