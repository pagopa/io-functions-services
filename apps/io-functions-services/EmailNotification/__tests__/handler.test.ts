/* eslint-disable @typescript-eslint/no-explicit-any */

import { apply } from "@pagopa/io-app-email-templates/MessagePreview/index";
import { StandardServiceCategoryEnum } from "@pagopa/io-functions-admin-sdk/StandardServiceCategory";
import { EmailAddress } from "@pagopa/io-functions-commons/dist/generated/definitions/EmailAddress";
import { MessageBodyMarkdown } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageBodyMarkdown";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { MessageSubject } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageSubject";
import { NotificationChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import * as mail from "@pagopa/io-functions-commons/dist/src/mailer/transports";
import { CreatedMessageEventSenderMetadata } from "@pagopa/io-functions-commons/dist/src/models/created_message_sender_metadata";
import {
  NewNotification,
  NotificationAddressSourceEnum,
  NotificationModel,
  RetrievedNotification
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import { markdownToHtml } from "@pagopa/io-functions-commons/dist/src/utils/markdown";
import {
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { beforeEach, describe, expect, it, test, vi } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import { aFiscalCode } from "../../__mocks__/mocks";
import {
  EmailNotificationInput,
  getEmailNotificationHandler
} from "../handler";
import { prepareBody } from "../utils";

beforeEach(() => vi.clearAllMocks());

const mockContext = {
  executionContext: { functionName: "funcname" },
  log: {
    error: console.error,

    info: console.log,

    verbose: console.log,

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

const notificationModelMock = {
  find: vi.fn(() => TE.of(O.some(aRetrievedNotification)))
} as unknown as NotificationModel;

const aNotificationId = "A_NOTIFICATION_ID" as NonEmptyString;
const anOrganizationFiscalCode = "10000000000" as OrganizationFiscalCode;

const aMessageBodyMarkdown =
  ('---\nit:\n  cta_1: \n    text: "Login"\n    action: "iosso://https://domainexample.com/path"\nen:\n "\n---' +
    "test".repeat(80)) as MessageBodyMarkdown;

const aMessageContent: MessageContent = {
  markdown: aMessageBodyMarkdown,
  subject: "test".repeat(10) as MessageSubject
};

const aMessage = {
  createdAt: new Date(),
  fiscalCode: aFiscalCode,
  id: aMessageId,
  indexedId: aMessageId,
  kind: "INewMessageWithoutContent" as const,
  senderServiceId: "s123" as NonEmptyString,
  senderUserId: "u123" as NonEmptyString,
  timeToLiveSeconds: 3600 as TimeToLiveSeconds
};

const aSenderMetadata: CreatedMessageEventSenderMetadata = {
  departmentName: "IT" as NonEmptyString,
  organizationFiscalCode: anOrganizationFiscalCode,
  organizationName: "AgID" as NonEmptyString,
  requireSecureChannels: false,
  serviceCategory: StandardServiceCategoryEnum.STANDARD,
  serviceName: "Test" as NonEmptyString,
  serviceUserEmail: "email@example.com" as EmailAddress
};

const HTML_TO_TEXT_OPTIONS: HtmlToTextOptions = {
  ignoreImage: true, // ignore all document images
  tables: true
};

const MAIL_FROM =
  "IO - l’app dei servizi pubblici <no-reply@io.italia.it>" as NonEmptyString;
const defaultNotificationParams = {
  HTML_TO_TEXT_OPTIONS,
  MAIL_FROM
};

const input: EmailNotificationInput = {
  messageId: aMessage.id,
  notificationId: aNotificationId
};

const lMailerTransporterMock = {} as unknown as mail.MailerTransporter;

const mockRetrieveProcessingMessageData = vi.fn().mockImplementation(() =>
  TE.of(
    O.some({
      content: aMessageContent,
      message: aMessage,
      senderMetadata: aSenderMetadata
    })
  )
);

describe("getEmailNotificationActivityHandler", () => {
  test("GIVEN an EmailNotification.handler WHEN the handler run  THEN should return SUCCESS with the right html email body", async () => {
    const mockSendMail = vi
      .spyOn(mail, "sendMail")
      .mockReturnValueOnce(TE.of("SUCCESS"));

    const GetEmailNotificationActivityHandler = getEmailNotificationHandler(
      lMailerTransporterMock,
      notificationModelMock,
      mockRetrieveProcessingMessageData,
      defaultNotificationParams
    );

    const result = await GetEmailNotificationActivityHandler(
      mockContext,
      JSON.stringify(input)
    );

    const expectedHtml = apply(
      (
        await markdownToHtml.process(prepareBody(aMessageContent.markdown))
      ).toString(),
      aMessageContent.subject,
      aSenderMetadata
    );

    expect(mockSendMail).toBeCalledWith(
      lMailerTransporterMock,
      expect.objectContaining({ html: expectedHtml })
    );

    expect(result.kind).toBe("SUCCESS");
  });

  it("should respond with 'SUCCESS' if the mail is sent", async () => {
    vi.spyOn(mail, "sendMail").mockReturnValueOnce(TE.of("SUCCESS"));

    const GetEmailNotificationActivityHandler = getEmailNotificationHandler(
      lMailerTransporterMock,
      notificationModelMock,
      mockRetrieveProcessingMessageData,
      defaultNotificationParams
    );

    const result = await GetEmailNotificationActivityHandler(
      mockContext,
      JSON.stringify(input)
    );

    expect(result.kind).toBe("SUCCESS");
  });

  it("should respond with 'ERROR' if the mail is not sent", async () => {
    const errorMessage = "Test Error";

    vi.spyOn(mail, "sendMail").mockReturnValueOnce(
      TE.left(new Error(errorMessage))
    );

    const GetEmailNotificationActivityHandler = getEmailNotificationHandler(
      lMailerTransporterMock,
      notificationModelMock,
      mockRetrieveProcessingMessageData,
      defaultNotificationParams
    );

    try {
      await GetEmailNotificationActivityHandler(
        mockContext,
        JSON.stringify(input)
      );
    } catch (e) {
      expect(e instanceof Error && e.message).toBe(
        "Error while sending email: " + errorMessage
      );
    }
  });
});

describe("prepareBody", () => {
  it("should return the markdown striped and truncated correctly", () => {
    const markdown =
      "# Header 1\nsome text\n## Header 2\nsome text\n### Header 3\nsome text\n#### Header 4\nsome text\n##### Header 5\nsome text\ntestesttesttesttestesttesttesttestesttesttesttestesttesttesttestesttesttesttestesttesttest";
    const r = prepareBody(markdown);
    //this should be 134 + 3 cause "..." is added at the end
    expect(r).toHaveLength(140);
    expect(r).not.toContain("#");
  });
});
