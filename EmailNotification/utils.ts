import { Either, left, right } from "fp-ts/lib/Either";
import * as NodeMailer from "nodemailer";

import { MessageBodyMarkdown } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageBodyMarkdown";
import { MessageSubject } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageSubject";
import { CreatedMessageEventSenderMetadata } from "@pagopa/io-functions-commons/dist/src/models/created_message_sender_metadata";
import { markdownToHtml } from "@pagopa/io-functions-commons/dist/src/utils/markdown";

import defaultEmailTemplate from "@pagopa/io-functions-commons/dist/src/templates/html/default";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/TaskEither";
import * as E from "fp-ts/Either";
import { OrganizationFiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as S from "fp-ts/string";
import { MessageContent } from "../generated/definitions/MessageContent";
import * as message_reduced_template from "../generated/templates/messagepreview/index";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const removeMd = require("remove-markdown");

const defaultEmailFooterMarkdown = `**Non rispondere a questa email. Questa casella di posta è utilizzata solo per l'invio della presente mail e, non essendo monitorata, non riceveresti risposta.**

Hai ricevuto questa comunicazione perché le tue preferenze nell’[App IO](https://io.italia.it/) indicano che hai abilitato l’inoltro via email dei messaggi relativi al servizio in oggetto.  
Se non vuoi più ricevere le comunicazioni relative a questo servizio, puoi modificare le tue preferenze nella relativa scheda servizio all’interno dell’App IO.  
Puoi anche disattivare l’inoltro dei messaggi via email per tutti i servizi, selezionando l'opzione “Disabilita per tutti i servizi” che trovi in "Profilo" > "Preferenze" > "Inoltro dei messaggi via email".
`;

const MAX_CHARACTER_FOR_BODY_MAIL = 134;

/**
 * Generates the HTML for the email from the Markdown content and the subject
 *
 * @deprecated use messageToHtml instead
 */
export const generateDocumentHtml = async (
  subject: MessageSubject,
  markdown: MessageBodyMarkdown,
  senderMetadata: CreatedMessageEventSenderMetadata
): Promise<string> => {
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
    // eslint-disable-next-line extra-rules/no-commented-out-code
    "", // TODO: headline
    senderMetadata.organizationName, // organization name
    senderServiceName, // service name
    organizationFiscalCode,
    subject,
    bodyHtml,
    footerHtml
  );
};

/**
 * Promise wrapper around Transporter#sendMail
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
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

type Processor = (
  input: string
) => Promise<{ readonly toString: () => string }>;

export const contentToHtml: (
  processor?: Processor
) => (markdown: string) => TE.TaskEither<Error, string> = (
  processor = markdownToHtml.process
) =>
  flow(
    TE.tryCatchK(m => processor(m), E.toError),
    TE.map(htmlAsFile => htmlAsFile.toString()),
    TE.map(S.replace(/\n|\r\n/g, "</p><p>"))
  );

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type MessageReducedToHtmlInput = {
  readonly content: MessageContent;
  readonly senderMetadata: CreatedMessageEventSenderMetadata;
};

export const truncateMarkdown = (plainText: string): string =>
  // we add "..." only when the message is going to be truncate
  plainText.length > MAX_CHARACTER_FOR_BODY_MAIL
    ? plainText.substring(0, MAX_CHARACTER_FOR_BODY_MAIL) + "..."
    : plainText.substring(0, MAX_CHARACTER_FOR_BODY_MAIL);

export const removeLinks = (text: string): string =>
  text.replace(/\w*:\/\/[^\s]*\.[\w?/=&%-+#]*/g, "[link rimosso]");

/**
 * Add a zero-width space before every '.' character in order to makke all the links not clickable
 * */

export const invalidateClickableLinks = (text: string): string =>
  text.replace(/\./g, ".\u{200B}");

export const prepareBody = (markdown: string): string =>
  pipe(
    // eslint-disable-next-line functional/immutable-data
    markdown.split("---").pop(),
    removeMd,
    truncateMarkdown,
    removeLinks,
    invalidateClickableLinks
  );

type MessageReducedToHtmlOutput = ({
  content,
  senderMetadata
}: MessageReducedToHtmlInput) => TE.TaskEither<Error, string>;

export const messageReducedToHtml = (
  processor?: Processor
): MessageReducedToHtmlOutput => ({
  content,
  senderMetadata
}): TE.TaskEither<Error, string> =>
  pipe(
    content.markdown,
    prepareBody,
    contentToHtml(processor),
    // strip leading zeroes
    TE.map(bodyHtml =>
      message_reduced_template.apply(content.subject, bodyHtml, {
        ...senderMetadata,
        organizationFiscalCode: senderMetadata.organizationFiscalCode.replace(
          /^0+/,
          ""
        ) as OrganizationFiscalCode
      })
    )
  );
