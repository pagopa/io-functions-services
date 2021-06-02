import { WithinRangeString } from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";
import { toString } from "fp-ts/lib/function";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { ApiNewMessageWithContentOf } from "../types";
import { PaymentData } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentData";

const aMessageContent = { subject: "a".repeat(10), markdown: "a".repeat(80) };

describe("ApiNewMessageWithContentOf", () => {
  it("should decode a specific subject", () => {
    const aSubject = "my specific subject";
    const aMessageWithSuchSubject = {
      content: { ...aMessageContent, subject: aSubject }
    };
    const aMessageWithDifferentSubject = {
      content: { ...aMessageContent }
    };
    const pattern = t.interface({
      subject: t.intersection([WithinRangeString(10, 121), t.literal(aSubject)])
    });

    const codec = ApiNewMessageWithContentOf(pattern);

    // positive scenario: we expect a match
    codec.decode(aMessageWithSuchSubject).fold(
      e => fail(`Should have decoded the value: ${readableReport(e)}`),
      e => {
        expect(e.content.subject).toBe(aSubject);
      }
    );

    // negative scenario: we expect a no-match
    codec.decode(aMessageWithDifferentSubject).fold(
      _ => {
        expect(true).toBe(true);
      },
      e => fail(`Should have not decoded the value: ${toString(e)}`)
    );
  });

  it("should decode a specific payment data", () => {
    const aPaymentData = { amount: 2, notice_number: "011111111111111111" };
    const aMessageWithSuchPaymentData = {
      content: { ...aMessageContent, payment_data: aPaymentData }
    };
    const aMessageWithNoPaymentData = {
      content: { ...aMessageContent }
    };

    const aMessageWithAnotherPaymentData = {
      content: {
        ...aMessageContent,
        payment_data: { amount: 3, notice_number: "101111111111111111" }
      }
    };
    const pattern = t.interface({
      payment_data: t.intersection([
        PaymentData,
        t.interface({
          amount: t.literal(aPaymentData.amount),
          notice_number: t.literal(aPaymentData.notice_number)
        })
      ])
    });

    const codec = ApiNewMessageWithContentOf(pattern);

    // positive scenario: we expect a match
    codec.decode(aMessageWithSuchPaymentData).fold(
      e => fail(`Should have decoded the value: ${readableReport(e)}`),
      e => {
        expect(e.content.payment_data).toEqual(
          expect.objectContaining(aPaymentData)
        );
      }
    );

    // negative scenario: we expect a no-match
    codec.decode(aMessageWithNoPaymentData).fold(
      _ => {
        expect(true).toBe(true);
      },
      e => fail(`Should have not decoded the value: ${toString(e)}`)
    );
    codec.decode(aMessageWithAnotherPaymentData).fold(
      _ => {
        expect(true).toBe(true);
      },
      e => fail(`Should have not decoded the value: ${toString(e)}`)
    );
  });
});
