import * as t from "io-ts";

import { Context } from "@azure/functions";
import {
  BlockedInboxOrChannel,
  BlockedInboxOrChannelEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { CreatedMessageEvent } from "@pagopa/io-functions-commons/dist/src/models/created_message_event";
import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import { BlobService } from "azure-storage";
import { isLeft } from "fp-ts/lib/Either";
import { fromNullable, isNone } from "fp-ts/lib/Option";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { isBefore } from "date-fns";
import { UTCISODateFromString } from "@pagopa/ts-commons/lib/dates";

export const SuccessfulStoreMessageContentActivityResult = t.interface({
  blockedInboxOrChannels: t.readonlyArray(BlockedInboxOrChannel),
  kind: t.literal("SUCCESS"),
  profile: RetrievedProfile
});

export type SuccessfulStoreMessageContentActivityResult = t.TypeOf<
  typeof SuccessfulStoreMessageContentActivityResult
>;

export const FailedStoreMessageContentActivityResult = t.interface({
  kind: t.literal("FAILURE"),
  reason: t.keyof({
    // see https://github.com/gcanti/io-ts#union-of-string-literals
    BAD_DATA: null,
    MASTER_INBOX_DISABLED: null,
    PERMANENT_ERROR: null,
    PROFILE_NOT_FOUND: null,
    SENDER_BLOCKED: null
  })
});

export type FailedStoreMessageContentActivityResult = t.TypeOf<
  typeof FailedStoreMessageContentActivityResult
>;

export const StoreMessageContentActivityResult = t.taggedUnion("kind", [
  SuccessfulStoreMessageContentActivityResult,
  FailedStoreMessageContentActivityResult
]);

export type StoreMessageContentActivityResult = t.TypeOf<
  typeof StoreMessageContentActivityResult
>;

/**
 * Returns a function for handling storeMessageContentActivity
 */
export const getStoreMessageContentActivityHandler = (
  lProfileModel: ProfileModel,
  lMessageModel: MessageModel,
  lBlobService: BlobService,
  optOutEmailSwitchDate: UTCISODateFromString
) => async (
  context: Context,
  input: unknown
): Promise<StoreMessageContentActivityResult> => {
  const createdMessageEventOrError = CreatedMessageEvent.decode(input);

  if (createdMessageEventOrError.isLeft()) {
    context.log.error(
      `StoreMessageContentActivity|Unable to parse CreatedMessageEvent`
    );
    context.log.verbose(
      `StoreMessageContentActivity|ERROR_DETAILS=${readableReport(
        createdMessageEventOrError.value
      )}`
    );
    return { kind: "FAILURE", reason: "BAD_DATA" };
  }

  const createdMessageEvent = createdMessageEventOrError.value;

  const newMessageWithoutContent = createdMessageEvent.message;

  const logPrefix = `StoreMessageContentActivity|MESSAGE_ID=${newMessageWithoutContent.id}`;

  context.log.verbose(`${logPrefix}|STARTING`);

  // fetch user's profile associated to the fiscal code
  // of the recipient of the message
  const errorOrMaybeProfile = await lProfileModel
    .findLastVersionByModelId([newMessageWithoutContent.fiscalCode])
    .run();

  if (isLeft(errorOrMaybeProfile)) {
    // The query has failed, we consider this as a transient error.
    // It's *critical* to trigger a retry here, otherwise no message
    // content will be saved.
    context.log.error(
      `${logPrefix}|ERROR=${JSON.stringify(errorOrMaybeProfile.value)}`
    );
    throw Error("Error while fetching profile");
  }

  const maybeProfile = errorOrMaybeProfile.value;

  if (isNone(maybeProfile)) {
    // the recipient doesn't have any profile yet
    context.log.warn(`${logPrefix}|RESULT=PROFILE_NOT_FOUND`);
    return { kind: "FAILURE", reason: "PROFILE_NOT_FOUND" };
  }

  const profile = maybeProfile.value;

  // channels the user has blocked for this sender service
  const blockedInboxOrChannels = fromNullable(profile.blockedInboxOrChannels)
    .chain(bc => fromNullable(bc[newMessageWithoutContent.senderServiceId]))
    .getOrElse([]);

  context.log.verbose(
    `${logPrefix}|BLOCKED_CHANNELS=${JSON.stringify(blockedInboxOrChannels)}`
  );

  //
  //  Inbox storage
  //

  // a profile exists and the global inbox flag is enabled
  const isInboxEnabled = profile.isInboxEnabled === true;

  if (!isInboxEnabled) {
    // the recipient's inbox is disabled
    context.log.warn(`${logPrefix}|RESULT=MASTER_INBOX_DISABLED`);
    return { kind: "FAILURE", reason: "MASTER_INBOX_DISABLED" };
  }

  // whether the user has blocked inbox storage for messages from this sender
  const isMessageStorageBlockedForService =
    blockedInboxOrChannels.indexOf(BlockedInboxOrChannelEnum.INBOX) >= 0;

  if (isMessageStorageBlockedForService) {
    // the recipient's inbox is disabled
    context.log.warn(`${logPrefix}|RESULT=SENDER_BLOCKED`);
    return { kind: "FAILURE", reason: "SENDER_BLOCKED" };
  }

  // Save the content of the message to the blob storage.
  // In case of a retry this operation will overwrite the message content with itself
  // (this is fine as we don't know if the operation succeeded at first)
  const errorOrAttachment = await lMessageModel
    .storeContentAsBlob(
      lBlobService,
      newMessageWithoutContent.id,
      createdMessageEvent.content
    )
    .run();

  if (isLeft(errorOrAttachment)) {
    context.log.error(`${logPrefix}|ERROR=${errorOrAttachment.value}`);
    throw new Error("Error while storing message content");
  }

  // Now that the message content has been stored, we can make the message
  // visible to getMessages by changing the pending flag to false
  const updatedMessageOrError = await lMessageModel
    .upsert({
      ...newMessageWithoutContent,
      isPending: false
    })
    .run();

  if (isLeft(updatedMessageOrError)) {
    context.log.error(
      `${logPrefix}|ERROR=${JSON.stringify(updatedMessageOrError.value)}`
    );
    throw new Error("Error while updating message pending status");
  }

  context.log.verbose(`${logPrefix}|RESULT=SUCCESS`);

  return {
    // being blockedInboxOrChannels a Set, we explicitly convert it to an array
    // since a Set can't be serialized to JSON
    blockedInboxOrChannels: Array.from(blockedInboxOrChannels),
    kind: "SUCCESS",
    profile: {
      ...profile,
      // if profile's timestamp is before email opt out switch limit date we must force isEmailEnabled to false
      // eslint-disable-next-line no-underscore-dangle
      isEmailEnabled: isBefore(profile._ts, optOutEmailSwitchDate)
        ? false
        : profile.isEmailEnabled
    }
  };
};
