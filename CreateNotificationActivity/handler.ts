import { Context } from "@azure/functions";

import { isLeft } from "fp-ts/lib/Either";
import { fromNullable, none, Option, some } from "fp-ts/lib/Option";

import { BlockedInboxOrChannelEnum } from "io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { HttpsUrl } from "io-functions-commons/dist/generated/definitions/HttpsUrl";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import { NotificationChannelEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannel";
import { CreatedMessageEvent } from "io-functions-commons/dist/src/models/created_message_event";
import { CreatedMessageEventSenderMetadata } from "io-functions-commons/dist/src/models/created_message_sender_metadata";
import {
  MESSAGE_COLLECTION_NAME,
  MessageModel,
  NewMessageWithoutContent
} from "io-functions-commons/dist/src/models/message";
import {
  createNewNotification,
  NewNotification,
  NOTIFICATION_COLLECTION_NAME,
  NotificationAddressSourceEnum,
  NotificationChannelEmail,
  NotificationModel
} from "io-functions-commons/dist/src/models/notification";
import { NotificationEvent } from "io-functions-commons/dist/src/models/notification_event";
import { RetrievedProfile } from "io-functions-commons/dist/src/models/profile";
import {
  newSenderService,
  SenderServiceModel
} from "io-functions-commons/dist/src/models/sender_service";
import { ulidGenerator } from "io-functions-commons/dist/src/utils/strings";

import { ISuccessfulStoreMessageContentActivityResult } from "../StoreMessageContentActivity/handler";

/**
 * Attempt to resolve an email address from
 * the recipient profile.
 */
function getEmailAddressFromProfile(
  profile: RetrievedProfile
): Option<NotificationChannelEmail> {
  return fromNullable(profile.email).map(email => ({
    addressSource: NotificationAddressSourceEnum.PROFILE_ADDRESS,
    toAddress: email
  }));
}

/**
 * Try to create (save) a new notification
 */
async function createNotification(
  lNotificationModel: NotificationModel,
  senderMetadata: CreatedMessageEventSenderMetadata,
  newMessageWithoutContent: NewMessageWithoutContent,
  newMessageContent: MessageContent,
  newNotification: NewNotification
): Promise<NotificationEvent> {
  const errorOrNotification = await lNotificationModel.create(
    newNotification,
    newNotification.messageId
  );

  if (isLeft(errorOrNotification)) {
    throw new Error(
      `Cannot save notification to database: ${errorOrNotification.value}`
    );
  }

  const notification = errorOrNotification.value;

  return {
    content: newMessageContent,
    message: newMessageWithoutContent,
    notificationId: notification.id,
    senderMetadata
  };
}

interface ICreateNotificationActivitySomeResult {
  kind: "some";
  notificationEvent: NotificationEvent;
  hasEmail: boolean;
  hasWebhook: boolean;
}

interface ICreateNotificationActivityNoneResult {
  kind: "none";
}

type ICreateNotificationActivityResult =
  | ICreateNotificationActivitySomeResult
  | ICreateNotificationActivityNoneResult;

/**
 * Returns a function for handling createNotificationActivity
 */
export const getCreateNotificationActivityHandler = (
  lSenderServiceModel: SenderServiceModel,
  lNotificationModel: NotificationModel,
  lDefaultWebhookUrl: HttpsUrl
) => async (
  context: Context,
  input: {
    createdMessageEvent: CreatedMessageEvent;
    storeMessageContentActivityResult: ISuccessfulStoreMessageContentActivityResult;
  }
): Promise<ICreateNotificationActivityResult> => {
  const { createdMessageEvent, storeMessageContentActivityResult } = input;

  const {
    senderMetadata,
    message: newMessageWithoutContent
  } = createdMessageEvent;
  const { blockedInboxOrChannels, profile } = storeMessageContentActivityResult;

  //
  //  Email notification
  //

  // check if the user has blocked emails sent from this service
  // 'some(true)' in case we must send the notification by email
  // 'none' in case the user has blocked the email channel
  const isEmailBlockedForService =
    blockedInboxOrChannels.indexOf(BlockedInboxOrChannelEnum.EMAIL) >= 0;

  const maybeAllowedEmailNotification = isEmailBlockedForService
    ? none
    : getEmailAddressFromProfile(profile).orElse(() => {
        context.log.verbose(
          `CreateNotificationActivity|User profile has no email address set|${profile.fiscalCode}`
        );
        return none;
      });

  //
  //  Webhook notification
  //

  // check if the user has blocked webhook notifications sent from this service
  const isWebhookBlockedForService =
    blockedInboxOrChannels.indexOf(BlockedInboxOrChannelEnum.WEBHOOK) >= 0;

  // whether the recipient wants us to send notifications to the app backend
  const isWebhookBlockedInProfile = profile.isWebhookEnabled === true;

  const isWebhookEnabled =
    !isWebhookBlockedForService && isWebhookBlockedInProfile;

  const maybeAllowedWebhookNotification = isWebhookEnabled
    ? some({
        url: lDefaultWebhookUrl
      })
    : none;

  // store fiscalCode -> serviceId
  const errorOrSenderService = await lSenderServiceModel.createOrUpdate(
    newSenderService(
      newMessageWithoutContent.fiscalCode,
      newMessageWithoutContent.senderServiceId,
      createdMessageEvent.serviceVersion
    ),
    // partition key
    newMessageWithoutContent.fiscalCode
  );

  if (isLeft(errorOrSenderService)) {
    throw new Error(
      `Cannot save sender service id: ${errorOrSenderService.value.body}`
    );
  }

  const noChannelsConfigured = [
    maybeAllowedEmailNotification,
    maybeAllowedWebhookNotification
  ].every(_ => _.isNone());

  if (noChannelsConfigured) {
    context.log.verbose(
      `CreateNotificationActivity|No channels configured for the user ${newMessageWithoutContent.fiscalCode} and no default address provided`
    );
    // return no notifications
    return { kind: "none" };
  }

  // create and save notification object
  const newNotification: NewNotification = {
    ...createNewNotification(
      ulidGenerator,
      newMessageWithoutContent.fiscalCode,
      newMessageWithoutContent.id
    ),
    channels: {
      [NotificationChannelEnum.EMAIL]: maybeAllowedEmailNotification.toUndefined(),
      [NotificationChannelEnum.WEBHOOK]: maybeAllowedWebhookNotification.toUndefined()
    }
  };

  const notificationEvent = await createNotification(
    lNotificationModel,
    senderMetadata,
    newMessageWithoutContent,
    createdMessageEvent.content,
    newNotification
  );

  // output notification events (one for each channel)
  return {
    hasEmail: maybeAllowedEmailNotification.isSome(),
    hasWebhook: maybeAllowedWebhookNotification.isSome(),
    kind: "some",
    notificationEvent
  };
};
