import { Context } from "@azure/functions";
import { BlobService } from "azure-storage";
import { isLeft } from "fp-ts/lib/Either";
import { fromNullable, isNone } from "fp-ts/lib/Option";
import { BlockedInboxOrChannelEnum } from "io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { CreatedMessageEvent } from "io-functions-commons/dist/src/models/created_message_event";
import { MessageModel } from "io-functions-commons/dist/src/models/message";
import {
  IProfileBlockedInboxOrChannels,
  ProfileModel,
  RetrievedProfile
} from "io-functions-commons/dist/src/models/profile";
import { ReadableReporter } from "italia-ts-commons/lib/reporters";

export interface ISuccessfulStoreMessageContentActivityResult {
  kind: "SUCCESS";
  blockedInboxOrChannels: ReadonlyArray<BlockedInboxOrChannelEnum>;
  profile: RetrievedProfile;
}

interface IFailedStoreMessageContentActivityResult {
  kind: "FAILURE";
  reason:  // tslint:disable-next-line: max-union-size
    | "PERMANENT_ERROR"
    | "PROFILE_NOT_FOUND"
    | "MASTER_INBOX_DISABLED"
    | "SENDER_BLOCKED";
}

type StoreMessageContentActivityResult =
  | ISuccessfulStoreMessageContentActivityResult
  | IFailedStoreMessageContentActivityResult;

/**
 * Returns a function for handling storeMessageContentActivity
 */
export const getStoreMessageContentActivityHandler = (
  lProfileModel: ProfileModel,
  lMessageModel: MessageModel,
  lBlobService: BlobService
) => async (
  context: Context,
  createdMessageEvent: CreatedMessageEvent
): Promise<StoreMessageContentActivityResult> => {
  const newMessageWithoutContent = createdMessageEvent.message;

  context.log.verbose(
    `StoreMessageContentActivity|Received createdMessageEvent|MESSAGE_ID=${newMessageWithoutContent.id}|RECIPIENT=${newMessageWithoutContent.fiscalCode}`
  );

  // fetch user's profile associated to the fiscal code
  // of the recipient of the message
  const errorOrMaybeProfile = await lProfileModel.findOneProfileByFiscalCode(
    newMessageWithoutContent.fiscalCode
  );

  if (isLeft(errorOrMaybeProfile)) {
    // The query has failed, we consider this as a trainsient error.
    // It's *critical* to trigger a retry here, otherwise no message
    // content will be saved.
    throw Error("Error while fetching profile");
  }

  const maybeProfile = errorOrMaybeProfile.value;

  if (isNone(maybeProfile)) {
    // the recipient doesn't have any profile yet
    return { kind: "FAILURE", reason: "PROFILE_NOT_FOUND" };
  }

  const profile = maybeProfile.value;

  // channels the user has blocked for this sender service
  const blockedInboxOrChannels = fromNullable(profile.blockedInboxOrChannels)
    .chain((bc: IProfileBlockedInboxOrChannels) =>
      fromNullable(bc[newMessageWithoutContent.senderServiceId])
    )
    .getOrElse(new Set());

  context.log.verbose(
    "StoreMessageContentActivityHandler|Blocked Channels(%s): %s",
    newMessageWithoutContent.fiscalCode,
    JSON.stringify(blockedInboxOrChannels)
  );

  //
  //  Inbox storage
  //

  // a profile exists and the global inbox flag is enabled
  const isInboxEnabled = profile.isInboxEnabled === true;

  if (!isInboxEnabled) {
    // the recipient's inbox is disabled
    return { kind: "FAILURE", reason: "MASTER_INBOX_DISABLED" };
  }

  // whether the user has blocked inbox storage for messages from this sender
  const isMessageStorageBlockedForService = blockedInboxOrChannels.has(
    BlockedInboxOrChannelEnum.INBOX
  );

  if (isMessageStorageBlockedForService) {
    // the recipient's inbox is disabled
    return { kind: "FAILURE", reason: "SENDER_BLOCKED" };
  }

  // Save the content of the message to the blob storage.
  // In case of a retry this operation will overwrite the message content with itself
  // (this is fine as we don't know if the operation succeeded at first)
  const errorOrAttachment = await lMessageModel.attachStoredContent(
    lBlobService,
    newMessageWithoutContent.id,
    newMessageWithoutContent.fiscalCode,
    createdMessageEvent.content
  );

  if (isLeft(errorOrAttachment)) {
    throw new Error("Error while storing message content");
  }

  // Now that the message content has been stored, we can make the message
  // visible to getMessages by changing the pending flag to false
  const updatedMessageOrError = await lMessageModel.createOrUpdate(
    {
      ...newMessageWithoutContent,
      isPending: false
    },
    createdMessageEvent.message.fiscalCode
  );

  if (isLeft(updatedMessageOrError)) {
    throw new Error("Error while updating message pending status");
  }

  return {
    // being blockedInboxOrChannels a Set, we explicitly convert it to an array
    // since a Set can't be serialized to JSON
    blockedInboxOrChannels: Array.from(blockedInboxOrChannels),
    kind: "SUCCESS",
    profile
  };
};
