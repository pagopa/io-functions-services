import { contentToHtml, messageToHtml } from "../utils";
import * as E from "fp-ts/Either";
import {
  aCreatedMessageEventSenderMetadata,
  aMessageContent,
  anError
} from "../../__mocks__/mocks";
import { OrganizationFiscalCode } from "@pagopa/io-functions-admin-sdk/OrganizationFiscalCode";

describe("contentToHtml", () => {
  test("GIVEN a simple content WHEN is converterd to html using the default processor THEN return an either containing the simple content", async () => {
    const simpleContent = "a simple content";
    const result = await contentToHtml()(simpleContent)();
    expect(result).toEqual(E.right(`<p>${simpleContent}</p>`));
  });

  test("GIVEN a multiline content WHEN is converterd to html using the default processor THEN return an either containing the content split in paragraph", async () => {
    const multilineContent = ["first line", "second line", "third line"];
    const result = await contentToHtml()(multilineContent.join("\n"))();
    expect(result).toEqual(
      E.right(`<p>${multilineContent.join("</p><p>")}</p>`)
    );
  });

  test("GIVEN any content WHEN is converterd to html using a not working processor THEN return an either containing an error", async () => {
    const mockProcessor = jest.fn().mockImplementationOnce(async () => {
      throw anError;
    });
    const result = await contentToHtml(mockProcessor)("")();
    expect(result).toEqual(E.left(anError));
  });
});

describe("messageToHtml", () => {
  test("GIVEN a simple message WHEN is converted to an html using the default processor THEN return an either contianing the email template with the simple content", async () => {
    const simpleMessage = {
      content: aMessageContent,
      senderMetadata: aCreatedMessageEventSenderMetadata
    };
    const result = await messageToHtml()(simpleMessage)();
    expect(result).toMatchSnapshot();
  });

  test("GIVEN a sender with a leading zero WHEN is converted to an html using the default processor THEN return an either contianing the email template with the simple content", async () => {
    const strippedOrganizationalFiscalCode = "19871987";
    const messageWithSenderWithLeadingZero = {
      content: aMessageContent,
      senderMetadata: {
        ...aCreatedMessageEventSenderMetadata,
        organizationFiscalCode: `000${strippedOrganizationalFiscalCode}` as OrganizationFiscalCode
      }
    };
    const result = await messageToHtml()(messageWithSenderWithLeadingZero)();
    expect(result).toEqual(
      expect.objectContaining({
        right: expect.stringContaining(
          `organizations/${strippedOrganizationalFiscalCode}.png`
        )
      })
    );
  });

  test("GIVEN any message WHEN is converted to an html using a not working processor THEN return an either containing an error", async () => {
    const mockProcessor = jest.fn().mockImplementationOnce(async () => {
      throw anError;
    });
    const simpleMessage = {
      content: aMessageContent,
      senderMetadata: aCreatedMessageEventSenderMetadata
    };
    const result = await messageToHtml(mockProcessor)(simpleMessage)();
    expect(result).toEqual(E.left(anError));
  });
});
