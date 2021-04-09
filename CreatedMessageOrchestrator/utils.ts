import { Function2 } from "fp-ts/lib/function";
import * as t from "io-ts";
import { initTelemetryClient } from "../utils/appinsights";

import { getConfigOrThrow } from "../utils/config";

/**
 * Extracts the input type of an activity handler
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HandlerInputType<T> = T extends Function2<any, infer A, any>
  ? A
  : never;

// eslint-disable-next-line @typescript-eslint/naming-convention
const MessageProcessingEvent = t.interface({
  name: t.string,
  properties: t.interface({
    details: t.string,
    isSuccess: t.string,
    messageId: t.string
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  DECODE_INPUT = "api.messages.create.decodeinput",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  STORE_MESSAGE_DECODE = "api.messages.create.storemessagedecode",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  UPDATE_NOTIFICATION_STATUS = "api.messages.create.updatenotificationstatus",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  NO_CHANNEL = "api.messages.create.nochannel",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  EMAIL_SENT = "api.messages.create.emailsent",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  WEBHOOK = "api.messages.create.webhook",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  UPDATE_MESSAGE_STATUS = "api.messages.create.updatemessagestatus"
}
