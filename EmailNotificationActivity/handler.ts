import * as t from "io-ts";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";

import { Context } from "@azure/functions";

import * as HtmlToText from "html-to-text";
import * as NodeMailer from "nodemailer";

import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import { ActiveMessage } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  EmailNotification,
  NotificationModel
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import { NotificationEvent } from "@pagopa/io-functions-commons/dist/src/models/notification_event";

import { sendMail } from "@pagopa/io-functions-commons/dist/src/mailer";
import { generateDocumentHtml } from "./utils";

export interface INotificationDefaults {
  readonly HTML_TO_TEXT_OPTIONS: HtmlToTextOptions;
  readonly MAIL_FROM: NonEmptyString;
}

export const EmailNotificationActivityInput = t.interface({
  notificationEvent: NotificationEvent
});

export type EmailNotificationActivityInput = t.TypeOf<
  typeof EmailNotificationActivityInput
>;

export const EmailNotificationActivityResult = t.taggedUnion("kind", [
  t.interface({
    kind: t.literal("SUCCESS"),
    // eslint-disable-next-line sort-keys
    result: t.keyof({ OK: null, EXPIRED: null })
  }),
  t.interface({
    kind: t.literal("FAILURE"),
    reason: t.keyof({ DECODE_ERROR: null })
  })
]);

export type EmailNotificationActivityResult = t.TypeOf<
  typeof EmailNotificationActivityResult
>;

/**
 * Returns a function for handling EmailNotificationActivity
 */
export const getEmailNotificationActivityHandler = (
  lMailerTransporter: NodeMailer.Transporter,
  lNotificationModel: NotificationModel,
  notificationDefaultParams: INotificationDefaults
) => async (
  context: Context,
  input: unknown
): Promise<EmailNotificationActivityResult> => {
  const inputOrError = EmailNotificationActivityInput.decode(input);

  if (E.isLeft(inputOrError)) {
    context.log.error(`EmailNotificationActivity|Cannot decode input`);
    context.log.verbose(
      `EmailNotificationActivity|ERROR_DETAILS=${readableReport(
        inputOrError.left
      )}`
    );
    return EmailNotificationActivityResult.encode({
      kind: "FAILURE",
      reason: "DECODE_ERROR"
    });
  }

  const { notificationEvent } = inputOrError.right;

  const {
    message,
    content,
    notificationId,
    senderMetadata
  } = notificationEvent;

  const logPrefix = `EmailNotificationActivity|MESSAGE_ID=${message.id}|NOTIFICATION_ID=${notificationId}`;

  // Check whether the message is expired
  const errorOrActiveMessage = ActiveMessage.decode(message);

  if (E.isLeft(errorOrActiveMessage)) {
    // if the message is expired no more processing is necessary
    context.log.warn(`${logPrefix}|RESULT=TTL_EXPIRED`);
    return EmailNotificationActivityResult.encode({
      kind: "SUCCESS",
      result: "EXPIRED"
    });
  }

  // fetch the notification
  const errorOrMaybeNotification = await lNotificationModel.find([
    notificationId,
    message.id
  ])();

  if (E.isLeft(errorOrMaybeNotification)) {
    const error = errorOrMaybeNotification.left;
    // we got an error while fetching the notification
    context.log.warn(`${logPrefix}|ERROR=${JSON.stringify(error)}`);
    throw new Error(
      `Error while fetching the notification: ${JSON.stringify(error)}`
    );
  }

  const maybeEmailNotification = errorOrMaybeNotification.right;

  if (O.isNone(maybeEmailNotification)) {
    // it may happen that the object is not yet visible to this function due to latency
    // as the notification object is retrieved from database and we may be hitting a
    // replica that is not yet in sync - throwing an error will trigger a retry
    context.log.warn(`${logPrefix}|RESULT=NOTIFICATION_NOT_FOUND`);
    throw new Error(`Notification not found`);
  }

  const errorOrEmailNotification = EmailNotification.decode(
    maybeEmailNotification.value
  );

  if (E.isLeft(errorOrEmailNotification)) {
    // The notification object is not compatible with this code
    const error = readableReport(errorOrEmailNotification.left);
    context.log.error(`${logPrefix}|ERROR`);
    context.log.verbose(`${logPrefix}|ERROR_DETAILS=${error}`);
    return EmailNotificationActivityResult.encode({
      kind: "FAILURE",
      reason: "DECODE_ERROR"
    });
  }

  const emailNotification = errorOrEmailNotification.right.channels.EMAIL;

  const documentHtml = await generateDocumentHtml(
    content.subject,
    content.markdown,
    senderMetadata
  );

  // converts the HTML to pure text to generate the text version of the message
  const bodyText = HtmlToText.fromString(
    documentHtml,
    notificationDefaultParams.HTML_TO_TEXT_OPTIONS
  );

  // trigger email delivery
  // see https://nodemailer.com/message/
  await pipe(
    sendMail(lMailerTransporter, {
      from: notificationDefaultParams.MAIL_FROM,
      headers: {
        "X-Italia-Messages-MessageId": message.id,
        "X-Italia-Messages-NotificationId": notificationId
      },
      html: documentHtml,
      messageId: message.id,
      subject: content.subject,
      text: bodyText,
      to: emailNotification.toAddress
      // priority: "high", // TODO: set based on kind of notification
      // disableFileAccess: true,
      // disableUrlAccess: true,
    }),
    TE.bimap(
      error => {
        context.log.error(`${logPrefix}|ERROR=${error.message}`);
        throw new Error(`Error while sending email: ${error.message}`);
      },
      () => context.log.verbose(`${logPrefix}|RESULT=SUCCESS`)
    )
  )();

  // TODO: handling bounces and delivery updates
  // see https://nodemailer.com/usage/#sending-mail
  // see #150597597
  return EmailNotificationActivityResult.encode({
    kind: "SUCCESS",
    result: "OK"
  });
};
