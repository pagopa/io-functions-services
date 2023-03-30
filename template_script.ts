import * as fs from "fs";
import fetch from "node-fetch";

const LOCAL_ASSET_REGEX = /\.\.\/assets\//g;
const REMOTE_ASSET_BASE_URL = (version: string): string =>
  `https://raw.githubusercontent.com/pagopa/io-messages-email-templates/${version}/assets/`;

export const generateTemplateForMessage = async (): Promise<void> => {
  const templateSourceVersion = process.argv[2];
  const templateTargetPath = process.argv[3];

  const templateResponse: Response = await fetch(
    `https://raw.githubusercontent.com/pagopa/io-messages-email-templates/${templateSourceVersion}/Service_Message_WithOrgLogo/index.html`
  );
  const templateHtml = await templateResponse.text();

  const templateHtmlWithAbsoluteUrl = templateHtml.replace(
    LOCAL_ASSET_REGEX,
    REMOTE_ASSET_BASE_URL(templateSourceVersion)
  );

  const content = `import { CreatedMessageEventSenderMetadata } from "@pagopa/io-functions-commons/dist/src/models/created_message_sender_metadata";
  export function apply(subject: string, body: string, senderMetadata: CreatedMessageEventSenderMetadata): string { return \`
  ${templateHtmlWithAbsoluteUrl}
  \`;}
  `;

  fs.writeFileSync(`${templateTargetPath}.ts`, content);
};

void generateTemplateForMessage();
