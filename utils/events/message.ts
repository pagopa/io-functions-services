import { BlockedInboxOrChannel } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { NewMessageDefaultAddresses } from "@pagopa/io-functions-commons/dist/generated/definitions/NewMessageDefaultAddresses";
import { CreatedMessageEventSenderMetadata } from "@pagopa/io-functions-commons/dist/src/models/created_message_sender_metadata";
import { NewMessageWithoutContent } from "@pagopa/io-functions-commons/dist/src/models/message";
import { RetrievedProfile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import { NonNegativeNumber } from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";

import { MessageContent } from "../../generated/definitions/MessageContent";

export type MessageId = t.TypeOf<typeof MessageId> &
  NewMessageWithoutContent["id"]; // interseption needed to keep both definitions consistent
export const MessageId = NonEmptyString;

export type CommonMessageData = t.TypeOf<typeof CommonMessageData>;
export const CommonMessageData = t.interface({
  content: MessageContent,
  message: NewMessageWithoutContent,
  senderMetadata: CreatedMessageEventSenderMetadata
});

export type CreatedMessageEvent = t.TypeOf<typeof CreatedMessageEvent>;
export const CreatedMessageEvent = t.intersection(
  [
    t.interface({
      messageId: MessageId,
      serviceVersion: NonNegativeNumber
    }),
    t.partial({
      defaultAddresses: NewMessageDefaultAddresses
    })
  ],
  "CreatedMessageEvent"
);

export type ProcessedMessageEvent = t.TypeOf<typeof ProcessedMessageEvent>;
export const ProcessedMessageEvent = t.interface({
  blockedInboxOrChannels: t.readonlyArray(BlockedInboxOrChannel),
  messageId: MessageId,
  profile: RetrievedProfile
});

export type NotificationCreatedEvent = t.TypeOf<
  typeof NotificationCreatedEvent
>;
export const NotificationCreatedEvent = t.interface({
  messageId: MessageId,
  notificationId: NonEmptyString
});
