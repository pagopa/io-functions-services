import { Context } from "@azure/functions";

import { isLeft } from "fp-ts/lib/Either";
import { isNone } from "fp-ts/lib/Option";

import * as HtmlToText from "html-to-text";
import * as NodeMailer from "nodemailer";

import {
  readableReport,
  ReadableReporter
} from "italia-ts-commons/lib/reporters";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

import {
  EmailNotification,
  NotificationModel
} from "io-functions-commons/dist/src/models/notification";
import { NotificationEvent } from "io-functions-commons/dist/src/models/notification_event";
import {
  TelemetryClient,
  wrapCustomTelemetryClient
} from "io-functions-commons/dist/src/utils/application_insights";
import { diffInMilliseconds } from "io-functions-commons/dist/src/utils/application_insights";

import { generateDocumentHtml, sendMail } from "./utils";

export interface INotificationDefaults {
  readonly HTML_TO_TEXT_OPTIONS: HtmlToTextOptions;
  readonly MAIL_FROM: NonEmptyString;
}

type IEmailNotificationActivityResult =
  | { kind: "SUCCESS"; result: "OK" | "EXPIRED" }
  | { kind: "FAILURE"; reason: "WRONG_FORMAT" };

// Whether we're in a production environment
const isProduction = process.env.NODE_ENV === "production";

const getCustomTelemetryClient = wrapCustomTelemetryClient(
  isProduction,
  new TelemetryClient()
);

/**
 * Returns a function for handling EmailNotificationActivity
 */
export const getEmailNotificationActivityHandler = (
  lMailerTransporter: NodeMailer.Transporter,
  lNotificationModel: NotificationModel,
  notificationDefaultParams: INotificationDefaults
) => async (
  context: Context,
  input: {
    emailNotificationEventJson: unknown;
  }
): Promise<IEmailNotificationActivityResult> => {
  const { emailNotificationEventJson } = input;

  const decodedEmailNotification = NotificationEvent.decode(
    emailNotificationEventJson
  );

  if (decodedEmailNotification.isLeft()) {
    context.log.error(
      `EmailNotificationActivity|Cannot decode EmailNotification|ERROR=${ReadableReporter.report(
        decodedEmailNotification
      ).join(" / ")}`
    );
    return { kind: "FAILURE", reason: "WRONG_FORMAT" };
  }

  const emailNotificationEvent = decodedEmailNotification.value;

  const logPrefix = `EmailNotificationActivity|MESSAGE_ID=${emailNotificationEvent.message.id}|RECIPIENT=${emailNotificationEvent.message.fiscalCode}|NOTIFICATION_ID=${emailNotificationEvent.notificationId}`;

  const {
    message,
    content,
    notificationId,
    senderMetadata
  } = emailNotificationEvent;

  const serviceId = message.senderServiceId;

  const eventName = "handler.notification.email";

  const appInsightsClient = getCustomTelemetryClient(
    {
      operationId: emailNotificationEvent.notificationId,
      operationParentId: emailNotificationEvent.message.id,
      serviceId: NonEmptyString.is(serviceId) ? serviceId : undefined
    },
    {
      messageId: emailNotificationEvent.message.id,
      notificationId: emailNotificationEvent.notificationId
    }
  );

  // If the message is expired we will not send any notification
  // FIXME: shouldn't TTL be optional?
  if (
    Date.now() - message.createdAt.getTime() >
    message.timeToLiveSeconds * 1000
  ) {
    // if the message is expired no more processing is necessary
    context.log.warn(`${logPrefix}|RESULT=TTL_EXPIRED`);
    return { kind: "SUCCESS", result: "EXPIRED" };
  }

  // fetch the notification
  const errorOrMaybeNotification = await lNotificationModel.find(
    notificationId,
    message.id
  );
  if (isLeft(errorOrMaybeNotification)) {
    const error = errorOrMaybeNotification.value;
    // we got an error while fetching the notification
    context.log.warn(`${logPrefix}|ERROR=${error.body}`);
    throw new Error(`Error while fetching the notification: ${error.body}`);
  }
  const maybeEmailNotification = errorOrMaybeNotification.value;
  if (isNone(maybeEmailNotification)) {
    // it may happen that the object is not yet visible to this function due to latency
    // as the notification object is retrieved from database and we may be hitting a
    // replica that is not yet in sync
    context.log.warn(`${logPrefix}|RESULT=NOTIFICATION_NOT_FOUND`);
    throw new Error(`Notification not found`);
  }
  const errorOrEmailNotification = EmailNotification.decode(
    maybeEmailNotification.value
  );
  if (isLeft(errorOrEmailNotification)) {
    // The notification object is not compatible with this code
    const error = readableReport(errorOrEmailNotification.value);
    context.log.error(`${logPrefix}|ERROR=${error}`);
    return { kind: "FAILURE", reason: "WRONG_FORMAT" };
  }
  const emailNotification = errorOrEmailNotification.value.channels.EMAIL;
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
  const startSendMailCallTime = process.hrtime();
  // trigger email delivery
  // see https://nodemailer.com/message/
  const sendResult = await sendMail(lMailerTransporter, {
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
  });
  const sendMailCallDurationMs = diffInMilliseconds(startSendMailCallTime);
  const eventContent = {
    dependencyTypeName: "HTTP",
    duration: sendMailCallDurationMs,
    name: "notification.email.delivery",
    properties: {
      addressSource: emailNotification.addressSource,
      transport: lMailerTransporter.transporter.name
    }
  };

  if (isLeft(sendResult)) {
    const error = sendResult.value;
    // track the event of failed delivery
    appInsightsClient.trackDependency({
      ...eventContent,
      data: error.message,
      resultCode: error.name,
      success: false
    });
    context.log.error(`${logPrefix}|ERROR=${error.message}`);
    throw new Error("Error while sending email");
  }

  // track the event of successful delivery
  appInsightsClient.trackDependency({
    ...eventContent,
    data: "OK",
    resultCode: 200,
    success: true
  });

  appInsightsClient.trackEvent({
    measurements: {
      elapsed: Date.now() - emailNotificationEvent.message.createdAt.getTime()
    },
    name: eventName,
    properties: {
      success: "true"
    }
  });

  context.log.verbose(`${logPrefix}|RESULT=SUCCESS`);

  // TODO: handling bounces and delivery updates
  // see https://nodemailer.com/usage/#sending-mail
  // see #150597597
  return { kind: "SUCCESS", result: "OK" };
};
