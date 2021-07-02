/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { CreatedMessageEvent } from "@pagopa/io-functions-commons/dist/src/models/created_message_event";
import { UTCISODateFromString } from "@pagopa/ts-commons/lib/dates";
import { NonNegativeNumber } from "@pagopa/ts-commons/lib/numbers";
import { fromLeft } from "fp-ts/lib/IOEither";
import { none, some } from "fp-ts/lib/Option";
import { taskEither } from "fp-ts/lib/TaskEither";
import {
  aCreatedMessageEventSenderMetadata,
  aMessageContent,
  aNewMessageWithoutContent,
  aRetrievedMessage,
  aRetrievedProfile
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

const anEmailModeSwitchLimitDate = UTCISODateFromString.decode(
  "2021-07-08T23:59:59Z"
).getOrElseL(() => fail("wrong date value"));

const aPastEmailModeSwitchLimitDate = UTCISODateFromString.decode(
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
describe("getStoreMessageContentActivityHandler", () => {
  it("should respond success with a retrieved profile with isEmailEnabled to false", async () => {
    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      // limit date is after profile timestamp
      anEmailModeSwitchLimitDate
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
      // limit date is before profile timestamp
      aPastEmailModeSwitchLimitDate
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
      aPastEmailModeSwitchLimitDate
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
      aPastEmailModeSwitchLimitDate
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
      aPastEmailModeSwitchLimitDate
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
      aPastEmailModeSwitchLimitDate
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
          blockedInboxOrChannels: { agid: BlockedInboxOrChannelEnum.INBOX }
        })
      )
    );
    const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
      profileModelMock as any,
      messageModelMock as any,
      {} as any,
      aPastEmailModeSwitchLimitDate
    );

    const result = await storeMessageContentActivityHandler(
      mockContext,
      aCreatedMessageEvent
    );

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
      aPastEmailModeSwitchLimitDate
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
      aPastEmailModeSwitchLimitDate
    );

    await expect(
      storeMessageContentActivityHandler(mockContext, aCreatedMessageEvent)
    ).rejects.toThrow();
  });
});
