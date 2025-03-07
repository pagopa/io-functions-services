import {
  FeatureLevelType,
  FeatureLevelTypeEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/FeatureLevelType";
import { NewMessage as ApiNewMessage } from "@pagopa/io-functions-commons/dist/generated/definitions/NewMessage";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import * as t from "io-ts";

import { ThirdPartyData } from "../generated/definitions/ThirdPartyData";

export type ApiNewMessageWithDefaults = t.TypeOf<
  typeof ApiNewMessageWithDefaults
>;
export const ApiNewMessageWithDefaults = t.intersection([
  ApiNewMessage,
  t.interface({
    feature_level_type: FeatureLevelType,
    time_to_live: TimeToLiveSeconds
  })
]);

type PartialMessageContent = Partial<(typeof ApiNewMessage._A)["content"]>;

/**
 * Codec that matches a Message with a specific content pattern
 *
 * @param contentPattern a coded that matches a content pattern
 * @returns a codec that specialize ApiNewMessage
 */
export type ApiNewMessageWithContentOf<T extends PartialMessageContent> =
  ApiNewMessage & { readonly content: T };
export const ApiNewMessageWithContentOf = <T extends PartialMessageContent>(
  contentPattern: t.Type<T, Partial<(typeof ApiNewMessage._O)["content"]>>
): t.Type<ApiNewMessage & { readonly content: T }, typeof ApiNewMessage._O> =>
  t.intersection([
    ApiNewMessage,
    t.interface({
      content: contentPattern
    })
  ]);

export type ApiNewMessageWithAdvancedFeatures = t.TypeOf<
  typeof ApiNewMessageWithAdvancedFeatures
>;
export const ApiNewMessageWithAdvancedFeatures = t.intersection([
  t.union([
    ApiNewMessageWithContentOf(
      t.interface({ third_party_data: ThirdPartyData })
    ),
    ApiNewMessage
  ]),
  t.interface({
    feature_level_type: t.literal(FeatureLevelTypeEnum.ADVANCED)
  })
]);

export const ApiNewThirdPartyMessage = t.intersection([
  ApiNewMessageWithContentOf(t.interface({ third_party_data: ThirdPartyData })),
  t.partial({
    feature_level_type: t.literal(FeatureLevelTypeEnum.STANDARD)
  })
]);

export type ApiNewThirdPartyMessage = t.TypeOf<typeof ApiNewThirdPartyMessage>;
