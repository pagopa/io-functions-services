/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonar/sonar-max-lines-per-function */
/* eslint-disable sonarjs/no-identical-functions */

import {
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";

import {
  EmailNotificationActivityInput,
  getEmailNotificationActivityHandler
} from "../handler";

import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

import { EmailAddress } from "@pagopa/io-functions-commons/dist/generated/definitions/EmailAddress";
import { MessageBodyMarkdown } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageBodyMarkdown";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { MessageSubject } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageSubject";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";

import { NotificationChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import * as mail from "@pagopa/io-functions-commons/dist/src/mailer/transports";
import { CreatedMessageEventSenderMetadata } from "@pagopa/io-functions-commons/dist/src/models/created_message_sender_metadata";
import {
  NewNotification,
  NotificationAddressSourceEnum,
  NotificationModel,
  RetrievedNotification
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import { HtmlToTextOptions } from "html-to-text";

beforeEach(() => jest.clearAllMocks());

const mockContext = {
  log: {
    // eslint-disable-next-line no-console
    error: console.error,
    // eslint-disable-next-line no-console
    info: console.log,
    // eslint-disable-next-line no-console
    verbose: console.log,
    // eslint-disable-next-line no-console
    warn: console.warn
  }
} as any;

const aMessageId = "A_MESSAGE_ID" as NonEmptyString;

const aNewEmailNotification: NewNotification = {
  channels: {
    [NotificationChannelEnum.EMAIL]: {
      addressSource: NotificationAddressSourceEnum.DEFAULT_ADDRESS,
      toAddress: "to@example.com" as EmailAddress
    }
  },
  fiscalCode: "FRLFRC74E04B157I" as any,
  id: "A_NOTIFICATION_ID" as NonEmptyString,
  kind: "INewNotification",
  messageId: aMessageId
};

const aRetrievedNotification: RetrievedNotification = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1,
  ...aNewEmailNotification,
  kind: "IRetrievedNotification"
};

const notificationModelMock = ({
  find: jest.fn(() => TE.of(O.some(aRetrievedNotification)))
} as unknown) as NotificationModel;

const aNotificationId = "A_NOTIFICATION_ID" as NonEmptyString;
const anOrganizationFiscalCode = "00000000000" as OrganizationFiscalCode;

const aMessageBodyMarkdown = "test".repeat(80) as MessageBodyMarkdown;

const aMessageContent: MessageContent = {
  markdown: aMessageBodyMarkdown,
  subject: "test".repeat(10) as MessageSubject
};

const aMessage = {
  createdAt: new Date(),
  fiscalCode: "FRLFRC74E04B157I" as any,
  id: aMessageId,
  indexedId: aMessageId,
  kind: "INewMessageWithoutContent" as "INewMessageWithoutContent",
  senderServiceId: "s123" as NonEmptyString,
  senderUserId: "u123" as NonEmptyString,
  timeToLiveSeconds: 3600 as TimeToLiveSeconds
};

const aSenderMetadata: CreatedMessageEventSenderMetadata = {
  departmentName: "IT" as NonEmptyString,
  organizationFiscalCode: anOrganizationFiscalCode,
  organizationName: "AgID" as NonEmptyString,
  requireSecureChannels: false,
  serviceName: "Test" as NonEmptyString,
  serviceUserEmail: "email@example.com" as EmailAddress
};

const HTML_TO_TEXT_OPTIONS: HtmlToTextOptions = {
  ignoreImage: true, // ignore all document images
  tables: true
};

const MAIL_FROM = "IO - l’app dei servizi pubblici <no-reply@io.italia.it>" as NonEmptyString;
const defaultNotificationParams = {
  HTML_TO_TEXT_OPTIONS,
  MAIL_FROM
};

const input: EmailNotificationActivityInput = {
  notificationEvent: {
    content: aMessageContent,
    message: aMessage,
    notificationId: aNotificationId,
    senderMetadata: aSenderMetadata
  }
};

const lMailerTransporterMock = ({} as unknown) as mail.MailerTransporter;

describe("getEmailNotificationActivityHandler", () => {
  it("should respond with 'SUCCESS' if the mail is sent", async () => {
    jest.spyOn(mail, "sendMail").mockReturnValueOnce(TE.of("SUCCESS"));

    const GetEmailNotificationActivityHandler = getEmailNotificationActivityHandler(
      lMailerTransporterMock,
      notificationModelMock,
      defaultNotificationParams
    );

    const result = await GetEmailNotificationActivityHandler(
      mockContext,
      input
    );

    expect(result.kind).toBe("SUCCESS");
  });

  it("should respond with 'ERROR' if the mail is not sent", async () => {
    const errorMessage: string = "Test Error";

    jest
      .spyOn(mail, "sendMail")
      .mockReturnValueOnce(TE.left(new Error(errorMessage)));

    const GetEmailNotificationActivityHandler = getEmailNotificationActivityHandler(
      lMailerTransporterMock,
      notificationModelMock,
      defaultNotificationParams
    );

    try {
      await GetEmailNotificationActivityHandler(mockContext, input);
    } catch (e) {
      expect(e.message).toBe("Error while sending email: " + errorMessage);
    }
  });
});
