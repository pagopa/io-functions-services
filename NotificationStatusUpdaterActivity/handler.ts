import * as t from "io-ts";

import { Context } from "@azure/functions";

import { NonEmptyString } from "italia-ts-commons/lib/strings";

import { NotificationChannel } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import { NotificationChannelStatusValue } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannelStatusValue";
import {
  getNotificationStatusUpdater,
  NotificationStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { ReadableReporter } from "italia-ts-commons/lib/reporters";

type INotificationStatusUpdaterResult =
  | {
      readonly kind: "SUCCESS";
    }
  | { readonly kind: "FAILURE" };

// eslint-disable-next-line @typescript-eslint/naming-convention
export const NotificationStatusUpdaterActivityInput = t.interface({
  channel: NotificationChannel,
  messageId: NonEmptyString,
  notificationId: NonEmptyString,
  status: NotificationChannelStatusValue
});

/**
 * Returns a function for handling EmailNotificationActivity
 */
export const getNotificationStatusUpdaterActivityHandler = (
  lNotificationStatusModel: NotificationStatusModel
) => async (
  context: Context,
  input: unknown
): Promise<INotificationStatusUpdaterResult> => {
  const decodedInput = NotificationStatusUpdaterActivityInput.decode(input);

  if (decodedInput.isLeft()) {
    context.log.error(
      `NotificationStatusUpdaterActivity|Cannot decode input|ERROR=${ReadableReporter.report(
        decodedInput
      ).join(" / ")}`
    );
    return { kind: "FAILURE" };
  }

  const { channel, notificationId, messageId, status } = decodedInput.value;
  const notificationStatusUpdater = getNotificationStatusUpdater(
    lNotificationStatusModel,
    channel,
    messageId,
    notificationId
  );
  const errorOrUpdatedNotificationStatus = await notificationStatusUpdater(
    status
  ).run();

  if (errorOrUpdatedNotificationStatus.isLeft()) {
    context.log.warn(
      `NotificationStatusUpdaterActivity|MESSAGE_ID=${messageId}|NOTIFICATION_ID=${notificationId}|CHANNEL=${channel}|STATUS=${status}|ERROR=${errorOrUpdatedNotificationStatus.value}`
    );
    throw new Error(JSON.stringify(errorOrUpdatedNotificationStatus.value));
  }

  context.log.verbose(
    `NotificationStatusUpdaterActivity|MESSAGE_ID=${messageId}|NOTIFICATION_ID=${notificationId}|CHANNEL=${channel}|STATUS=${status}|RESULT=SUCCESS`
  );

  return { kind: "SUCCESS" };
};
