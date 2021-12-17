import * as t from "io-ts";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import { NewMessage as ApiNewMessage } from "@pagopa/io-functions-commons/dist/generated/definitions/NewMessage";
import { LegalData } from "../generated/definitions/LegalData";

export type ApiNewMessageWithDefaults = t.TypeOf<
  typeof ApiNewMessageWithDefaults
>;
export const ApiNewMessageWithDefaults = t.intersection([
  ApiNewMessage,
  t.interface({ time_to_live: TimeToLiveSeconds })
]);

/**
 * Codec that matches a Message with a specific content pattern
 *
 * @param contentPattern a coded that matches a content pattern
 * @returns a codec that specialize ApiNewMessage
 */
export type ApiNewMessageWithContentOf<
  T extends Partial<typeof ApiNewMessage._O["content"]>
> = ApiNewMessage & { readonly content: T };
export const ApiNewMessageWithContentOf = <
  T extends Partial<typeof ApiNewMessage._O["content"]>
>(
  contentPattern: t.Type<T, Partial<typeof ApiNewMessage._O["content"]>>
): t.Type<ApiNewMessage & { readonly content: T }, typeof ApiNewMessage._O> =>
  t.intersection([
    ApiNewMessage,
    t.interface({
      content: contentPattern
    })
  ]);

export const ApiNewMessageWithDefaultsLegalData = t.intersection([
  ApiNewMessageWithDefaults,
  ApiNewMessageWithContentOf(t.interface({ legal_data: LegalData }))
]);
export type ApiNewMessageWithDefaultsLegalData = t.TypeOf<
  typeof ApiNewMessageWithDefaultsLegalData
>;
