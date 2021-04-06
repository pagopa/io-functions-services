import * as fc from "fast-check";

import { NonEmptyString } from "italia-ts-commons/lib/strings";

import { BlockedInboxOrChannelEnum } from "io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";

import { RetrievedProfile } from "io-functions-commons/dist/src/models/profile";
import { retrievedProfileArb } from "./arbitraries";
import { isSenderAllowed, retrievedProfileToLimitedProfile } from "../profile";

describe("isSenderAllowed", () => {
  it("should return false if the service is not allowed to send notifications to the user", () => {
    const blockedInboxOrChannels: RetrievedProfile["blockedInboxOrChannels"] = {
      "01234567890": [BlockedInboxOrChannelEnum.INBOX]
    };

    const isAllowed = isSenderAllowed(
      blockedInboxOrChannels,
      "01234567890" as NonEmptyString
    );

    expect(isAllowed).toBe(false);
  });

  it("should return true if the service is allowed to send notifications to the user", () => {
    const blockedInboxOrChannels: RetrievedProfile["blockedInboxOrChannels"] = {};

    const isAllowed = isSenderAllowed(
      blockedInboxOrChannels,
      "01234567890" as NonEmptyString
    );

    expect(isAllowed).toBe(true);
  });
});

describe("retrievedProfileToLimitedProfile", () => {
  it("should return a LimitedProfile with the right data", () => {
    fc.assert(
      fc.property(
        retrievedProfileArb,
        fc.boolean(),
        (retrived, senderAllowed) => {
          const limitedProfile = retrievedProfileToLimitedProfile(
            retrived,
            senderAllowed
          );
          expect(limitedProfile).toEqual({
            preferred_languages: retrived.preferredLanguages,
            sender_allowed: senderAllowed
          });
        }
      )
    );
  });
});
