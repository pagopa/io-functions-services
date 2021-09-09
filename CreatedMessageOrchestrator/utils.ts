import * as t from "io-ts";
import { initTelemetryClient } from "../utils/appinsights";

import { getConfigOrThrow } from "../utils/config";

const MessageProcessingEvent = t.interface({
  name: t.string,
  properties: t.interface({
    details: t.string,
    isSuccess: t.string,
    messageId: t.string,
    serviceId: t.string
  })
});

export type MessageProcessingEvent = t.TypeOf<typeof MessageProcessingEvent>;

const config = getConfigOrThrow();

const telemetryClient = initTelemetryClient(
  config.APPINSIGHTS_INSTRUMENTATIONKEY
);

export const trackMessageProcessing = (
  event: MessageProcessingEvent,
  isReplaying: boolean
): void =>
  !isReplaying
    ? telemetryClient.trackEvent({
        name: event.name,
        properties: event.properties,
        tagOverrides: { samplingEnabled: "false" }
      })
    : null;

export enum MessageProcessingEventNames {
  DECODE_INPUT = "api.messages.create.decodeinput",
  STORE_MESSAGE_DECODE = "api.messages.create.storemessagedecode",
  UPDATE_NOTIFICATION_STATUS = "api.messages.create.updatenotificationstatus",
  NO_CHANNEL = "api.messages.create.nochannel",
  EMAIL_SENT = "api.messages.create.emailsent",
  WEBHOOK = "api.messages.create.webhook",
  UPDATE_MESSAGE_STATUS = "api.messages.create.updatemessagestatus"
}
