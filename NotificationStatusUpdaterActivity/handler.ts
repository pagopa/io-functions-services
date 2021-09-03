import * as t from "io-ts";
import * as E from "fp-ts/lib/Either";

import { Context } from "@azure/functions";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import { NotificationChannel } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import { NotificationChannelStatusValue } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannelStatusValue";
import {
  getNotificationStatusUpdater,
  NotificationStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { ReadableReporter } from "@pagopa/ts-commons/lib/reporters";

type INotificationStatusUpdaterResult =
  | {
      readonly kind: "SUCCESS";
    }
  | { readonly kind: "FAILURE" };

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

  if (E.isLeft(decodedInput)) {
    context.log.error(
      `NotificationStatusUpdaterActivity|Cannot decode input|ERROR=${ReadableReporter.report(
        decodedInput
      ).join(" / ")}`
    );
    return { kind: "FAILURE" };
  }

  const { channel, notificationId, messageId, status } = decodedInput.right;
  const notificationStatusUpdater = getNotificationStatusUpdater(
    lNotificationStatusModel,
    channel,
    messageId,
    notificationId
  );
  const errorOrUpdatedNotificationStatus = await notificationStatusUpdater(
    status
  )();

  if (E.isLeft(errorOrUpdatedNotificationStatus)) {
    context.log.warn(
      `NotificationStatusUpdaterActivity|MESSAGE_ID=${messageId}|NOTIFICATION_ID=${notificationId}|CHANNEL=${channel}|STATUS=${status}|ERROR=${errorOrUpdatedNotificationStatus.left}`
    );
    throw new Error(JSON.stringify(errorOrUpdatedNotificationStatus.left));
  }

  context.log.verbose(
    `NotificationStatusUpdaterActivity|MESSAGE_ID=${messageId}|NOTIFICATION_ID=${notificationId}|CHANNEL=${channel}|STATUS=${status}|RESULT=SUCCESS`
  );

  return { kind: "SUCCESS" };
};
