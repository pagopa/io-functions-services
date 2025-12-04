import { Request } from "express";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import { describe, expect, it } from "vitest";

import { ApiNewMessageWithDefaults } from "../../CreateMessage/types";
import { MessagePayloadMiddleware } from "../message_middlewares";

describe("MessagePayloadMiddleware", () => {
  it("should return a validation error using the simplified version if the body does not match ApiNewMessageWithDefault", async () => {
    const message: ApiNewMessageWithDefaults = {
      content: {
        markdown: "md",
        subject: "subject"
      }
    } as ApiNewMessageWithDefaults;
    const mockRequest = { body: message } as Request;
    pipe(
      await MessagePayloadMiddleware(mockRequest),
      E.mapLeft(r =>
        expect(r.detail).toContain(
          'value "subject" at root.content.subject is not a valid [string of length >= 10 and < 121]'
        )
      )
    );
  });
});
