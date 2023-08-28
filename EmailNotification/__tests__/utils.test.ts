import { contentToHtml, messageReducedToHtml } from "../utils";
import * as E from "fp-ts/Either";
import {
  aCreatedMessageEventSenderMetadata,
  aMessageContent,
  anError
} from "../../__mocks__/mocks";

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

describe("messageReducedToHtml", () => {
  test("GIVEN a simple message WHEN is converted to an html using the default processor THEN return an either containing the email template with the simple content", async () => {
    const simpleMessage = {
      content: aMessageContent,
      senderMetadata: aCreatedMessageEventSenderMetadata
    };
    const result = await messageReducedToHtml()(simpleMessage)();
    expect(result).toMatchSnapshot();
  });

  test("GIVEN any message WHEN is converted to an html using a not working processor THEN return an either containing an error", async () => {
    const mockProcessor = jest.fn().mockImplementationOnce(async () => {
      throw anError;
    });
    const simpleMessage = {
      content: aMessageContent,
      senderMetadata: aCreatedMessageEventSenderMetadata
    };
    const result = await messageReducedToHtml(mockProcessor)(simpleMessage)();
    expect(result).toEqual(E.left(anError));
  });
});
