import * as t from "io-ts";
import { CreatedMessageEventSenderMetadata } from "@pagopa/io-functions-commons/dist/src/models/created_message_sender_metadata";
import { NewMessageDefaultAddresses } from "@pagopa/io-functions-commons/dist/generated/definitions/NewMessageDefaultAddresses";
import { NewMessageWithoutContent } from "@pagopa/io-functions-commons/dist/src/models/message";
import { NonNegativeNumber } from "@pagopa/ts-commons/lib/numbers";
import { BlockedInboxOrChannel } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { RetrievedProfile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { MessageContent } from "../../generated/definitions/MessageContent";

export type CreatedMessageEvent = t.TypeOf<typeof CreatedMessageEvent>;
export const CreatedMessageEvent = t.intersection(
  [
    t.interface({
      content: MessageContent,
      message: NewMessageWithoutContent,
      senderMetadata: CreatedMessageEventSenderMetadata,
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
  content: MessageContent,
  message: NewMessageWithoutContent,
  profile: RetrievedProfile,
  senderMetadata: CreatedMessageEventSenderMetadata
});

export type NotificationCreatedEvent = t.TypeOf<
  typeof NotificationCreatedEvent
>;
export const NotificationCreatedEvent = t.interface({
  notificationEvent: t.interface({
    content: MessageContent,
    message: NewMessageWithoutContent,
    notificationId: NonEmptyString,
    senderMetadata: CreatedMessageEventSenderMetadata
  })
});
