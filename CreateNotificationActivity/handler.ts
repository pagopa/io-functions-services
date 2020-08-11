import * as util from "util";

import { Context } from "@azure/functions";

import * as t from "io-ts";

import { isLeft } from "fp-ts/lib/Either";
import { fromNullable, none, Option, some } from "fp-ts/lib/Option";

import { readableReport } from "italia-ts-commons/lib/reporters";

import { BlockedInboxOrChannelEnum } from "io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { FiscalCode } from "io-functions-commons/dist/generated/definitions/FiscalCode";
import { HttpsUrl } from "io-functions-commons/dist/generated/definitions/HttpsUrl";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import { NotificationChannelEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannel";
import { CreatedMessageEvent } from "io-functions-commons/dist/src/models/created_message_event";
import { CreatedMessageEventSenderMetadata } from "io-functions-commons/dist/src/models/created_message_sender_metadata";
import { NewMessageWithoutContent } from "io-functions-commons/dist/src/models/message";
import {
  createNewNotification,
  NewNotification,
  NotificationAddressSourceEnum,
  NotificationChannelEmail,
  NotificationModel
} from "io-functions-commons/dist/src/models/notification";
import { NotificationEvent } from "io-functions-commons/dist/src/models/notification_event";
import { RetrievedProfile } from "io-functions-commons/dist/src/models/profile";
import { ulidGenerator } from "io-functions-commons/dist/src/utils/strings";

import { ServiceId } from "io-functions-commons/dist/generated/definitions/ServiceId";
import { SuccessfulStoreMessageContentActivityResult } from "../StoreMessageContentActivity/handler";

/**
 * Attempt to resolve an email address from
 * the recipient profile.
 */
const getEmailAddressFromProfile = (
  profile: RetrievedProfile
): Option<NotificationChannelEmail> =>
  fromNullable(profile.email).map(email => ({
    addressSource: NotificationAddressSourceEnum.PROFILE_ADDRESS,
    toAddress: email
  }));

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
  const errorOrNotification = await lNotificationModel
    .create(newNotification)
    .run();

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

export const CreateNotificationActivityInput = t.interface({
  createdMessageEvent: CreatedMessageEvent,
  storeMessageContentActivityResult: SuccessfulStoreMessageContentActivityResult
});

export type CreateNotificationActivityInput = t.TypeOf<
  typeof CreateNotificationActivityInput
>;

const CreateNotificationActivitySomeResult = t.interface({
  hasEmail: t.boolean,
  hasWebhook: t.boolean,
  kind: t.literal("some"),
  notificationEvent: NotificationEvent
});

type CreateNotificationActivitySomeResult = t.TypeOf<
  typeof CreateNotificationActivitySomeResult
>;

const CreateNotificationActivityNoneResult = t.interface({
  kind: t.literal("none")
});

type CreateNotificationActivityNoneResult = t.TypeOf<
  typeof CreateNotificationActivityNoneResult
>;

export const CreateNotificationActivityResult = t.taggedUnion("kind", [
  CreateNotificationActivitySomeResult,
  CreateNotificationActivityNoneResult
]);

export type CreateNotificationActivityResult = t.TypeOf<
  typeof CreateNotificationActivityResult
>;

/**
 * Returns a function for handling createNotificationActivity
 */
export const getCreateNotificationActivityHandler = (
  lNotificationModel: NotificationModel,
  lDefaultWebhookUrl: HttpsUrl,
  lSandboxFiscalCode: FiscalCode,
  lEmailNotificationServiceBlackList: ReadonlyArray<ServiceId>
) => async (context: Context, input: unknown): Promise<unknown> => {
  const inputOrError = CreateNotificationActivityInput.decode(input);
  if (inputOrError.isLeft()) {
    context.log.error(
      `CreateNotificationActivity|Unable to parse CreateNotificationActivityHandlerInput`
    );
    context.log.verbose(
      `CreateNotificationActivity|ERROR_DETAILS=${readableReport(
        inputOrError.value
      )}`
    );
    return CreateNotificationActivityResult.encode({
      kind: "none"
    });
  }

  const {
    createdMessageEvent,
    storeMessageContentActivityResult
  } = inputOrError.value;

  const logPrefix = `CreateNotificationActivity|MESSAGE_ID=${createdMessageEvent.message.id}|RECIPIENT=${createdMessageEvent.message.fiscalCode}`;

  context.log.verbose(`${logPrefix}|STARTING`);

  const {
    senderMetadata,
    message: newMessageWithoutContent
  } = createdMessageEvent;
  const { blockedInboxOrChannels, profile } = storeMessageContentActivityResult;

  //
  // Decide whether to send an email notification
  //

  // whether email notifications are enabled in this user profile - this is
  // true by default, it's false only for users that have isEmailEnabled = false
  // in their profile. We assume it's true when not defined in user's profile.
  const isEmailEnabledInProfile = profile.isEmailEnabled !== false;

  // Check if the email in the user profile is validated.
  // we assume it's true when not defined in user's profile.
  const isEmailValidatedInProfile = profile.isEmailValidated !== false;

  // first we check whether the user has blocked emails notifications for the
  // service that is sending the message
  const isEmailBlockedForService =
    blockedInboxOrChannels.indexOf(BlockedInboxOrChannelEnum.EMAIL) >= 0;

  // If the message is sent to the SANDBOX_FISCAL_CODE we consider it a test message
  // so we send the email notification to the email associated to the user owner
  // of the sender service (the one registered in the developer portal).
  // Otherwise we try to get the email from the user profile.
  const maybeNotificationEmailAddress: Option<NotificationChannelEmail> =
    newMessageWithoutContent.fiscalCode === lSandboxFiscalCode
      ? some({
          addressSource: NotificationAddressSourceEnum.SERVICE_USER_ADDRESS,
          toAddress: senderMetadata.serviceUserEmail
        })
      : getEmailAddressFromProfile(profile);

  // the sender service allows email channel
  const isEmailChannelAllowed = !senderMetadata.requireSecureChannels;

  // wether the service is in our blacklist for sending email
  const isEmailDisabledForService = lEmailNotificationServiceBlackList.includes(
    createdMessageEvent.message.senderServiceId
  );

  // finally we decide whether we should send the email notification or not -
  // we send an email notification when all the following conditions are met:
  //
  // * email notifications are enabled for this service (!isInBlackList)
  // * email notifications are enabled in the user profile (isEmailEnabledInProfile)
  // * email is validated in the user profile (isEmailValidatedInProfile)
  // * email notifications are not blocked for the sender service (!isEmailBlockedForService)
  // * the sender service allows email channel
  // * a destination email address is configured (maybeNotificationEmailAddress)
  //
  const maybeEmailNotificationAddress =
    !isEmailDisabledForService &&
    isEmailEnabledInProfile &&
    isEmailValidatedInProfile &&
    !isEmailBlockedForService &&
    isEmailChannelAllowed
      ? maybeNotificationEmailAddress
      : none;

  context.log.verbose(
    `${logPrefix}|CHANNEL=EMAIL|PROFILE_ENABLED=${isEmailEnabledInProfile}|SERVICE_BLOCKED=${isEmailBlockedForService}|PROFILE_EMAIL=${maybeEmailNotificationAddress.isSome()}|WILL_NOTIFY=${maybeEmailNotificationAddress.isSome()}`
  );

  //
  //  Decide whether to send a webhook notification
  //

  // whether the recipient wants us to send notifications to the app backend
  const isWebhookEnabledInProfile = profile.isWebhookEnabled === true;

  // check if the user has blocked webhook notifications sent from this service
  const isWebhookBlockedForService =
    blockedInboxOrChannels.indexOf(BlockedInboxOrChannelEnum.WEBHOOK) >= 0;

  // finally we decide whether we should send the webhook notification or not -
  // we send a webhook notification when all the following conditions are met:
  //
  // * webhook notifications are enabled in the user profile (isWebhookEnabledInProfile)
  // * webhook notifications are not blocked for the sender service (!isWebhookBlockedForService)
  //
  const maybeWebhookNotificationUrl =
    isWebhookEnabledInProfile && !isWebhookBlockedForService
      ? some({
          url: lDefaultWebhookUrl
        })
      : none;

  context.log.verbose(
    `${logPrefix}|CHANNEL=WEBHOOK|CHANNEL_ENABLED=${isWebhookEnabledInProfile}|SERVICE_BLOCKED=${isWebhookBlockedForService}|WILL_NOTIFY=${maybeWebhookNotificationUrl.isSome()}`
  );

  //
  // If we can't send any notification there's not point in creating a
  // Notification object
  //

  const noChannelsConfigured =
    maybeEmailNotificationAddress.isNone() &&
    maybeWebhookNotificationUrl.isNone();

  if (noChannelsConfigured) {
    context.log.warn(`${logPrefix}|RESULT=NO_CHANNELS_ENABLED`);
    // return no notifications
    return {
      kind: "none"
    };
  }

  //
  // Create a Notification object to track the status of each notification
  //

  const newNotification: NewNotification = {
    ...createNewNotification(
      ulidGenerator,
      newMessageWithoutContent.fiscalCode,
      newMessageWithoutContent.id
    ),
    channels: {
      [NotificationChannelEnum.EMAIL]: maybeEmailNotificationAddress.toUndefined(),
      [NotificationChannelEnum.WEBHOOK]: maybeWebhookNotificationUrl.toUndefined()
    }
  };

  const notificationEvent = await createNotification(
    lNotificationModel,
    senderMetadata,
    newMessageWithoutContent,
    createdMessageEvent.content,
    newNotification
  );

  context.log.verbose(`${logPrefix}|RESULT=SUCCESS`);

  context.log.verbose(util.inspect(notificationEvent));

  // Return the notification event to the orchestrator
  // The orchestrato will then run the actual notification activities
  return CreateNotificationActivityResult.encode({
    hasEmail: maybeEmailNotificationAddress.isSome(),
    hasWebhook: maybeWebhookNotificationUrl.isSome(),
    kind: "some",
    notificationEvent
  });
};
