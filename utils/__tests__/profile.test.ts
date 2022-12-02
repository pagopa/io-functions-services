import * as fc from "fast-check";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";

import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  getLimitedProfileTask,
  isSenderAllowedLegacy,
  retrievedProfileToLimitedProfile
} from "../profile";
import { retrievedProfileArb } from "./arbitraries";
import {
  aFiscalCode,
  anAzureApiAuthorization,
  anAzureUserAttributes,
  anIncompleteService,
  anotherFiscalCode,
  aRetrievedProfile,
  aRetrievedServicePreference,
  autoProfileServicePreferencesSettings,
  legacyProfileServicePreferencesSettings,
  manualProfileServicePreferencesSettings,
  anActivation
} from "../../__mocks__/mocks";
import * as O from "fp-ts/Option";

import MockResponse from "../../__mocks__/response";

const mockTelemetryClient = ({
  trackEvent: jest.fn()
} as unknown) as ReturnType<typeof initTelemetryClient>;

import {
  makeServicesPreferencesDocumentId,
  RetrievedServicePreference,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";

import { some, none } from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";

import { UserGroup } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { initTelemetryClient } from "../appinsights";
import { ServiceId } from "../../generated/definitions/ServiceId";
import { ActivationModel } from "@pagopa/io-functions-commons/dist/src/models/activation";
import { ActivationStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ActivationStatus";
import { SpecialServiceCategoryEnum } from "@pagopa/io-functions-admin-sdk/SpecialServiceCategory";
import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { canSendMessageOnActivationWithGrace } from "../services";
import { Second } from "@pagopa/ts-commons/lib/units";
import { subSeconds } from "date-fns";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";

describe("isSenderAllowed", () => {
  it("should return false if the service is not allowed to send notifications to the user", async () => {
    const blockedInboxOrChannels: RetrievedProfile["blockedInboxOrChannels"] = {
      "01234567890": [BlockedInboxOrChannelEnum.INBOX]
    };

    const result = await isSenderAllowedLegacy(
      blockedInboxOrChannels,
      "01234567890" as NonEmptyString
    )();

    pipe(
      result,
      E.fold(
        _ => fail("Unexpected failure"),
        isAllowed => {
          expect(isAllowed).toBe(false);
        }
      )
    );
  });

  it("should return true if the service is allowed to send notifications to the user", async () => {
    const blockedInboxOrChannels: RetrievedProfile["blockedInboxOrChannels"] = {};

    const result = await isSenderAllowedLegacy(
      blockedInboxOrChannels,
      "01234567890" as NonEmptyString
    )();

    pipe(
      result,
      E.fold(
        _ => fail("Unexpected failure"),
        isAllowed => {
          expect(isAllowed).toBe(true);
        }
      )
    );
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

const aRetrievedProfileWithLegacyPreferences = {
  ...aRetrievedProfile,
  servicePreferencesSettings: legacyProfileServicePreferencesSettings
};

const aRetrievedProfileWithManualPreferences = {
  ...aRetrievedProfile,
  servicePreferencesSettings: manualProfileServicePreferencesSettings
};

const aRetrievedProfileWithAutoPreferences = {
  ...aRetrievedProfile,
  servicePreferencesSettings: autoProfileServicePreferencesSettings
};

const mockProfileFindLast = jest.fn(() =>
  TE.of(some(aRetrievedProfileWithLegacyPreferences))
);
const mockProfileModel = ({
  findLastVersionByModelId: mockProfileFindLast
} as unknown) as ProfileModel;

const mockServicePreferenceFind = jest.fn();
const mockServiceActivationFind = jest.fn();
const mockServicePreferenceModel = ({
  find: mockServicePreferenceFind
} as unknown) as ServicesPreferencesModel;
const mockServiceActivationModel = ({
  findLastVersionByModelId: mockServiceActivationFind
} as unknown) as ActivationModel;

// utility that adds a given set of serviceIds to the profile's inbox blacklist
const withBlacklist = (
  profile: RetrievedProfile,
  services: ServiceId[] = []
) => ({
  ...profile,
  blockedInboxOrChannels: services.reduce(
    (obj, serviceId) => ({
      ...obj,
      [serviceId]: [BlockedInboxOrChannelEnum.INBOX]
    }),
    {}
  )
});
describe("getLimitedProfileTask", () => {
  const mockExpressResponse = MockResponse();
  const mockGracePeriod = 100 as Second;
  const canSendMessageOnActivation = canSendMessageOnActivationWithGrace(
    mockGracePeriod
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each`
    preferencesConfiguration                           | allowOrNot     | mode        | profile                                                                                             | maybePreference                                                    | expected
    ${"the inbox is enabled in the preferences"}       | ${"allow"}     | ${"MANUAL"} | ${aRetrievedProfileWithManualPreferences}                                                           | ${some({ ...aRetrievedServicePreference, isInboxEnabled: true })}  | ${true}
    ${"the inbox is enabled in the preferences"}       | ${"allow"}     | ${"AUTO"}   | ${aRetrievedProfileWithAutoPreferences}                                                             | ${some({ ...aRetrievedServicePreference, isInboxEnabled: true })}  | ${true}
    ${"the inbox is NOT enabled in the preferences"}   | ${"not allow"} | ${"MANUAL"} | ${aRetrievedProfileWithManualPreferences}                                                           | ${some({ ...aRetrievedServicePreference, isInboxEnabled: false })} | ${false}
    ${"the inbox is NOT enabled in the preferences"}   | ${"not allow"} | ${"AUTO"}   | ${aRetrievedProfileWithAutoPreferences}                                                             | ${some({ ...aRetrievedServicePreference, isInboxEnabled: false })} | ${false}
    ${"there are not preferences set for the service"} | ${"not allow"} | ${"MANUAL"} | ${aRetrievedProfileWithManualPreferences}                                                           | ${none}                                                            | ${false}
    ${"there are not preferences set for the service"} | ${"allow"}     | ${"AUTO"}   | ${aRetrievedProfileWithAutoPreferences}                                                             | ${none}                                                            | ${true}
    ${"the service is NOT in the blacklist"}           | ${"allow"}     | ${"LEGACY"} | ${withBlacklist(aRetrievedProfileWithLegacyPreferences, ["any-service-id" as ServiceId])}           | ${none}                                                            | ${true}
    ${"has empty blacklist"}                           | ${"allow"}     | ${"LEGACY"} | ${withBlacklist(aRetrievedProfileWithLegacyPreferences, [])}                                        | ${none}                                                            | ${true}
    ${"the service is in the blacklist"}               | ${"not allow"} | ${"LEGACY"} | ${withBlacklist(aRetrievedProfileWithLegacyPreferences, [anAzureUserAttributes.service.serviceId])} | ${none}                                                            | ${false}
  `(
    "should $allowOrNot a sender if the user uses $mode subscription mode and $preferencesConfiguration",
    async ({
      mode,
      profile,
      maybePreference,
      expected
    }: {
      mode: "AUTO" | "MANUAL" | "LEGACY";
      profile: RetrievedProfile;
      maybePreference: O.Option<RetrievedServicePreference>;
      expected: any;
    }) => {
      mockProfileFindLast.mockImplementationOnce(() => TE.of(some(profile)));
      mockServicePreferenceFind.mockImplementationOnce(() =>
        TE.of(maybePreference)
      );

      const result = await getLimitedProfileTask(
        anAzureApiAuthorization,
        anAzureUserAttributes,
        aFiscalCode,
        mockProfileModel,
        false,
        [],
        mockServicePreferenceModel,
        mockServiceActivationModel,
        canSendMessageOnActivation,
        mockTelemetryClient
      )();
      result.apply(mockExpressResponse);

      expect(
        mockServiceActivationModel.findLastVersionByModelId
      ).not.toHaveBeenCalled();
      if (mode !== "LEGACY") {
        expect(mockServicePreferenceModel.find).toBeCalledWith([
          makeServicesPreferencesDocumentId(
            aFiscalCode,
            anAzureUserAttributes.service.serviceId,
            profile.servicePreferencesSettings.version as NonNegativeInteger
          ),
          aFiscalCode
        ]);
      } else {
        // LEGACY mode will use blacklist in profile instead of ServicePreference
        expect(mockServicePreferenceModel.find).not.toBeCalled();
      }

      expect(result.kind).toBe("IResponseSuccessJson");

      expect(mockExpressResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ sender_allowed: expected })
      );
    }
  );

  it.each`
    scenario                                                   | responseKind                | maybeProfile
    ${"the requested profile does not have the inbox enabled"} | ${"IResponseErrorNotFound"} | ${TE.of(some({ ...aRetrievedProfile, isInboxEnabled: false }))}
    ${"the requested profile is not found in the db"}          | ${"IResponseErrorNotFound"} | ${TE.of(none)}
    ${"a database error occurs"}                               | ${"IResponseErrorQuery"}    | ${TE.left({})}
  `(
    "should respond with $responseKind when $scenario",
    async ({ responseKind, maybeProfile }) => {
      const mockProfileModel = ({
        findLastVersionByModelId: jest.fn(() => maybeProfile)
      } as unknown) as ProfileModel;
      const response = await getLimitedProfileTask(
        {
          ...anAzureApiAuthorization,
          groups: new Set([UserGroup.ApiMessageWrite])
        },
        anAzureUserAttributes,
        aFiscalCode,
        mockProfileModel,
        true,
        [],
        mockServicePreferenceModel,
        mockServiceActivationModel,
        canSendMessageOnActivation,
        mockTelemetryClient
      )();

      expect(mockProfileModel.findLastVersionByModelId).toHaveBeenCalledTimes(
        1
      );
      expect(mockProfileModel.findLastVersionByModelId).toBeCalledWith([
        aFiscalCode
      ]);
      expect(
        mockServiceActivationModel.findLastVersionByModelId
      ).not.toHaveBeenCalled();
      expect(response.kind).toBe(responseKind);
    }
  );

  it.each`
    scenario                                                   | groups                                | service
    ${"the service does not have the required quality fields"} | ${[UserGroup.ApiMessageWrite]}        | ${anIncompleteService}
    ${"the service is sandboxed"}                              | ${[UserGroup.ApiLimitedMessageWrite]} | ${anAzureUserAttributes.service}
  `(
    "should respond with 403 IResponseErrorForbiddenNotAuthorizedForRecipient when $scenario",
    async ({ groups, service }) => {
      const mockProfileModel = ({
        findLastVersionByModelId: jest.fn(() => TE.of(some(aRetrievedProfile)))
      } as unknown) as ProfileModel;
      const response = await getLimitedProfileTask(
        {
          ...anAzureApiAuthorization,
          groups: new Set(groups)
        },
        {
          ...anAzureUserAttributes,
          service: {
            ...service,
            // note that we're not including aFiscalCode in the allowed recipients
            authorizedRecipients: new Set([anotherFiscalCode])
          }
        },
        aFiscalCode,
        mockProfileModel,
        true,
        [],
        mockServicePreferenceModel,
        mockServiceActivationModel,
        canSendMessageOnActivation,
        mockTelemetryClient
      )();

      expect(mockProfileModel.findLastVersionByModelId).not.toHaveBeenCalled();
      expect(
        mockServiceActivationModel.findLastVersionByModelId
      ).not.toHaveBeenCalled();

      expect(response.kind).toBe(
        "IResponseErrorForbiddenNotAuthorizedForRecipient"
      );
    }
  );

  it.each`
    preferencesConfiguration                                             | allowOrNot     | mode        | maybeProfile                                    | maybeActivation                                                                                                  | expected
    ${"the SPECIAL service has ACTIVE activation"}                       | ${"allow"}     | ${"MANUAL"} | ${some(aRetrievedProfileWithManualPreferences)} | ${some(anActivation)}                                                                                            | ${true}
    ${"the SPECIAL service has ACTIVE activation"}                       | ${"allow"}     | ${"AUTO"}   | ${some(aRetrievedProfileWithAutoPreferences)}   | ${some(anActivation)}                                                                                            | ${true}
    ${"the SPECIAL service has INACTIVE activation"}                     | ${"not allow"} | ${"MANUAL"} | ${some(aRetrievedProfileWithManualPreferences)} | ${some({ ...anActivation, status: ActivationStatusEnum.INACTIVE })}                                              | ${false}
    ${"the SPECIAL service has INACTIVE activation"}                     | ${"not allow"} | ${"AUTO"}   | ${some(aRetrievedProfileWithAutoPreferences)}   | ${some({ ...anActivation, status: ActivationStatusEnum.INACTIVE })}                                              | ${false}
    ${"the SPECIAL service has PENDING activation in grace period"}      | ${"allow"}     | ${"AUTO"}   | ${some(aRetrievedProfileWithAutoPreferences)}   | ${some({ ...anActivation, status: ActivationStatusEnum.PENDING, _ts: Date.now() })}                              | ${true}
    ${"the SPECIAL service has PENDING activation outside grace period"} | ${"not allow"} | ${"AUTO"}   | ${some(aRetrievedProfileWithAutoPreferences)}   | ${some({ ...anActivation, status: ActivationStatusEnum.PENDING, _ts: subSeconds(Date.now(), mockGracePeriod) })} | ${false}
    ${"the SPECIAL service has not an activation"}                       | ${"not allow"} | ${"MANUAL"} | ${some(aRetrievedProfileWithManualPreferences)} | ${none}                                                                                                          | ${false}
    ${"the SPECIAL service has not an activation"}                       | ${"not allow"} | ${"AUTO"}   | ${some(aRetrievedProfileWithAutoPreferences)}   | ${none}                                                                                                          | ${false}
  `(
    "should $allowOrNot a sender if the user uses $mode subscription mode and $preferencesConfiguration",
    async ({ maybeProfile, maybeActivation, expected }) => {
      mockProfileFindLast.mockImplementationOnce(() => TE.of(maybeProfile));
      mockServiceActivationFind.mockImplementationOnce(() =>
        TE.of(maybeActivation)
      );

      const result = await getLimitedProfileTask(
        anAzureApiAuthorization,
        {
          ...anAzureUserAttributes,
          service: {
            ...anAzureUserAttributes.service,
            serviceMetadata: {
              ...anAzureUserAttributes.service.serviceMetadata,
              scope: ServiceScopeEnum.NATIONAL,
              category: SpecialServiceCategoryEnum.SPECIAL
            }
          }
        },
        aFiscalCode,
        mockProfileModel,
        false,
        [],
        mockServicePreferenceModel,
        mockServiceActivationModel,
        canSendMessageOnActivation,
        mockTelemetryClient
      )();
      result.apply(mockExpressResponse);

      expect(mockServicePreferenceModel.find).not.toHaveBeenCalled();

      expect(result.kind).toBe("IResponseSuccessJson");

      expect(mockExpressResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ sender_allowed: expected })
      );
    }
  );

  it("should responde with an ResponseErrorInternal if an error occurs accessing the activation", async () => {
    mockProfileFindLast.mockImplementationOnce(() =>
      TE.of(some(aRetrievedProfileWithManualPreferences))
    );
    mockServiceActivationFind.mockImplementationOnce(() =>
      TE.left(toCosmosErrorResponse(new Error("Cosmos error")))
    );

    const result = await getLimitedProfileTask(
      anAzureApiAuthorization,
      {
        ...anAzureUserAttributes,
        service: {
          ...anAzureUserAttributes.service,
          serviceMetadata: {
            ...anAzureUserAttributes.service.serviceMetadata,
            scope: ServiceScopeEnum.NATIONAL,
            category: SpecialServiceCategoryEnum.SPECIAL
          }
        }
      },
      aFiscalCode,
      mockProfileModel,
      false,
      [],
      mockServicePreferenceModel,
      mockServiceActivationModel,
      canSendMessageOnActivation,
      mockTelemetryClient
    )();
    result.apply(mockExpressResponse);

    expect(mockServicePreferenceModel.find).not.toHaveBeenCalled();
    expect(mockServiceActivationFind).toBeCalledTimes(1);

    expect(result.kind).toBe("IResponseErrorInternal");
  });
});
