/* eslint-disable no-console */
import * as fs from "fs";

const LOCAL_ASSET_REGEX = /\.\.\/assets\//g;
const REMOTE_ASSET_BASE_URL = (version: string): string =>
  `https://raw.githubusercontent.com/pagopa/io-messages-email-templates/${version}/assets/`;

export const generateTemplateForMessage = async (): Promise<void> => {
  const templateSourceVersion = process.argv[2];
  const templateTargetPath = process.argv[3];

  console.log(
    `generating template for message using version ${templateSourceVersion} and target output ${templateTargetPath}`
  );

  const templateResponse: Response = await fetch(
    `https://raw.githubusercontent.com/pagopa/io-messages-email-templates/${templateSourceVersion}/MessagePreview/index.html`
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
console.log("done");
