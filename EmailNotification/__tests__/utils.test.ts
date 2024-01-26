import {
  contentToHtml,
  invalidateClickableLinks,
  messageReducedToHtml,
  removeLinks,
  truncateMarkdown
} from "../utils";
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

describe("truncateMarkdown", () => {
  test("should add '...' at the end of the string if the plain text length is > 134", () => {
    expect(truncateMarkdown(aMessageContent.markdown).slice(-3)).toBe("...");
  });
  test("should not add '...' at the end of the string if the plain text length is <= 134", () => {
    expect(truncateMarkdown("This message is < than 134 chars")).not.toContain(
      "..."
    );
  });
});

describe("removeLinks", () => {
  test("should return the same string if no url is contained", () => {
    const text = "A simple text without any url";
    expect(removeLinks(text)).toBe(text);
  });

  test("should return the string without the url if a simple url is contained", () => {
    const simpleLink = "https://asimplelink.com/";
    const baseText = `A simple text`;
    expect(removeLinks(`${baseText} ${simpleLink}`)).toBe(
      `${baseText} [link rimosso]`
    );
  });

  test("should return the string without the url if more than one simple url are contained", () => {
    const simpleLink = "https://asimplelink.com/";
    const baseText = `A simple text`;
    expect(
      removeLinks(
        `${baseText} ${simpleLink} this is another link ${simpleLink}`
      )
    ).toBe(`${baseText} [link rimosso] this is another link [link rimosso]`);
  });

  test("should return the string without the url if an url with query params is contained", () => {
    const simpleLink = "https://asimplelink.com/?qp1=value";
    const baseText = `A simple text`;
    expect(removeLinks(`${baseText} ${simpleLink}`)).toBe(
      `${baseText} [link rimosso]`
    );
  });

  test("should return the string without the url if an url with query params and # is contained ", () => {
    const simpleLink = "https://asimplelink.com/?qp1=value#header";
    const baseText = `A simple text`;
    expect(removeLinks(`${baseText} ${simpleLink}`)).toBe(
      `${baseText} [link rimosso]`
    );
  });
});

describe("invalidateClickableLinks", () => {
  test("should return the same string if no period are provided", () => {
    expect(invalidateClickableLinks("a simple text with no period")).toBe(
      "a simple text with no period"
    );
  });

  test("should add a zero-width space before every '.' character", () => {
    expect(invalidateClickableLinks("a text.with 2 period.")).toBe(
      "a text.\u{200B}with 2 period.\u{200B}"
    );
  });
});
