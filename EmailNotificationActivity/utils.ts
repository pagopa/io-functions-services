import { Either, left, right } from "fp-ts/lib/Either";
import * as NodeMailer from "nodemailer";

import { MessageBodyMarkdown } from "io-functions-commons/dist/generated/definitions/MessageBodyMarkdown";
import { MessageSubject } from "io-functions-commons/dist/generated/definitions/MessageSubject";
import { CreatedMessageEventSenderMetadata } from "io-functions-commons/dist/src/models/created_message_sender_metadata";
import { markdownToHtml } from "io-functions-commons/dist/src/utils/markdown";

// TODO: import generation script from digital-citizenship-functions
import defaultEmailTemplate from "./templates/html/default";

/**
 * Generates the HTML for the email from the Markdown content and the subject
 */
export async function generateDocumentHtml(
  subject: MessageSubject,
  markdown: MessageBodyMarkdown,
  senderMetadata: CreatedMessageEventSenderMetadata
): Promise<string> {
  // converts the markdown body to HTML
  const bodyHtml = (await markdownToHtml.process(markdown)).toString();

  // compose the service name from the department name and the service name
  const senderServiceName = `${senderMetadata.departmentName}<br />${senderMetadata.serviceName}`;

  // strip leading zeroes
  const organizationFiscalCode = senderMetadata.organizationFiscalCode.replace(
    /^0+/,
    ""
  );

  // wrap the generated HTML into an email template
  return defaultEmailTemplate(
    subject, // title
    "", // TODO: headline
    senderMetadata.organizationName, // organization name
    senderServiceName, // service name
    organizationFiscalCode,
    subject,
    bodyHtml,
    "" // TODO: footer
  );
}

/**
 * Promise wrapper around Transporter#sendMail
 */
export async function sendMail(
  transporter: NodeMailer.Transporter,
  options: NodeMailer.SendMailOptions
): Promise<Either<Error, NodeMailer.SentMessageInfo>> {
  return new Promise<Either<Error, NodeMailer.SentMessageInfo>>(resolve => {
    transporter.sendMail(options, (err, res) => {
      const result: Either<Error, NodeMailer.SentMessageInfo> = err
        ? left(err)
        : right(res);
      resolve(result);
    });
  });
}
