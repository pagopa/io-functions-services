import { Either, left, right } from "fp-ts/lib/Either";
import * as NodeMailer from "nodemailer";

import { MessageBodyMarkdown } from "io-functions-commons/dist/generated/definitions/MessageBodyMarkdown";
import { MessageSubject } from "io-functions-commons/dist/generated/definitions/MessageSubject";
import { CreatedMessageEventSenderMetadata } from "io-functions-commons/dist/src/models/created_message_sender_metadata";
import { markdownToHtml } from "io-functions-commons/dist/src/utils/markdown";

// TODO: import generation script from digital-citizenship-functions
import defaultEmailTemplate from "./templates/html/default";

const defaultEmailFooterMarkdown = `Questa è una comunicazione automatica inviata da un indirizzo che non supporta risposte, ti preghiamo di non rispondere.

Hai ricevuto questa comunicazione perchè le tue preferenze nell’[App IO](https://io.italia.it/) indicano che hai abilitato l’inoltro via email dei messaggi relativi al servizio in oggetto. 
Se non vuoi più ricevere le comunicazioni relative a questo servizio, puoi modificare le tue preferenze nella relativa scheda servizio all’interno dell’App IO. 
Puoi anche disattivare l’inoltro dei messaggi via email per tutti i servizi, selezionando l'opzione “Disabilita per tutti i servizi” che trovi in "Profilo" > "Preferenze" > "Inoltro dei messaggi via email".
`;

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

  // converts the markdown footer to HTML
  const footerHtml = (
    await markdownToHtml.process(defaultEmailFooterMarkdown)
  ).toString();

  // wrap the generated HTML into an email template
  return defaultEmailTemplate(
    subject, // title
    "", // TODO: headline
    senderMetadata.organizationName, // organization name
    senderServiceName, // service name
    organizationFiscalCode,
    subject,
    bodyHtml,
    footerHtml
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
