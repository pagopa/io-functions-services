import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { LimitedProfile } from "@pagopa/io-functions-commons/dist/generated/definitions/LimitedProfile";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import { ValidService } from "@pagopa/io-functions-commons/dist/src/models/service";
import { IAzureApiAuthorization } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import { IRequestMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";

import { Task } from "fp-ts/lib/Task";
import { ServicesPreferencesModeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import {
  makeServicesPreferencesDocumentId,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  ResponseErrorInternal,
  IResponseErrorForbiddenNotAuthorizedForRecipient,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorizedForRecipient,
  ResponseErrorFromValidationErrors,
  ResponseErrorNotFound,
  ResponseSuccessJson,
  IResponseErrorInternal
} from "@pagopa/ts-commons/lib/responses";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { pipe, identity } from "fp-ts/lib/function";
import { ActivationModel } from "@pagopa/io-functions-commons/dist/src/models/activation";
import { FiscalCodePayload } from "../generated/definitions/FiscalCodePayload";
import { canWriteMessage } from "../CreateMessage/handler";
import { SpecialServiceCategoryEnum } from "../generated/api-admin/SpecialServiceCategory";
import { initTelemetryClient } from "./appinsights";
import { toHash } from "./crypto";
import { canSendMessageOnActivationWithGrace } from "./services";

// Map an error when an unexpected value is passed
interface IUnexpectedValue {
  readonly kind: "UNEXPECTED_VALUE";
  readonly value: unknown;
}
/**
 * Creates a IUnexpectedValue error object
 * value is defined as never so the function can be used for exhaustive checks
 *
 * @param value the unexpected value
 * @returns a formatted IUnexpectedValue error
 */
const unexpectedValue = (value: never): IUnexpectedValue => ({
  kind: "UNEXPECTED_VALUE",
  value
});

/**
 * Whether the sender service is allowed to send
 * messages to the user identified by this profile
 * which servicesPreferencesSettings.mode is LEGACY
 */
export const isSenderAllowedLegacy = (
  blockedInboxOrChannels:
    | RetrievedProfile["blockedInboxOrChannels"]
    | undefined,
  serviceId: ServiceId
): TaskEither<never, boolean> =>
  TE.of(
    blockedInboxOrChannels === undefined ||
      blockedInboxOrChannels[serviceId] === undefined ||
      !blockedInboxOrChannels[serviceId].includes(
        BlockedInboxOrChannelEnum.INBOX
      )
  );

/**
 * Whether the sender service is allowed to send
 * messages to the user identified by this profile
 * which servicesPreferencesSettings.mode is NOT LEGACY
 */
export const isSenderAllowed = (
  servicesPreferencesModel: ServicesPreferencesModel,
  serviceId: ServiceId,
  fiscalCode: FiscalCode,
  {
    mode,
    version
  }: {
    readonly mode:
      | ServicesPreferencesModeEnum.AUTO
      | ServicesPreferencesModeEnum.MANUAL;
    readonly version: NonNegativeInteger;
  }
): TaskEither<CosmosErrors | IUnexpectedValue, boolean> =>
  pipe(
    makeServicesPreferencesDocumentId(fiscalCode, serviceId, version),
    TE.of,
    TE.chain(docId => servicesPreferencesModel.find([docId, fiscalCode])),
    TE.chain(maybeDoc =>
      pipe(
        maybeDoc,
        O.fold(
          // In case the user hasn't a specific preference for the service,
          //   use default behaviour depending on profile's mode
          () =>
            mode === ServicesPreferencesModeEnum.AUTO
              ? TE.of(true)
              : mode === ServicesPreferencesModeEnum.MANUAL
              ? TE.of(false)
              : TE.left(unexpectedValue(mode)),
          // Read straight from the preference
          doc => TE.of(doc.isInboxEnabled)
        )
      )
    )
  );

/**
 * Converts the RetrievedProfile model to LimitedProfile type.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function retrievedProfileToLimitedProfile(
  retrivedProfile: RetrievedProfile,
  senderAllowed: boolean
): LimitedProfile {
  return {
    preferred_languages: retrivedProfile.preferredLanguages,
    // computed property
    sender_allowed: senderAllowed
  };
}

/**
 * A middleware that extracts a GetLimitedProfileByPOSTPayload from a request.
 */
export const FiscalCodePayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  FiscalCodePayload
> = request =>
  Promise.resolve(
    pipe(
      request.body,
      FiscalCodePayload.decode,
      E.mapLeft(ResponseErrorFromValidationErrors(FiscalCodePayload))
    )
  );

export type IGetLimitedProfileFailureResponses =
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseErrorInternal
  | IResponseErrorForbiddenNotAuthorizedForRecipient;
export type IGetLimitedProfileResponses =
  | IResponseSuccessJson<LimitedProfile>
  | IGetLimitedProfileFailureResponses;

export const getLimitedProfileTask = (
  apiAuthorization: IAzureApiAuthorization,
  userAttributes: IAzureUserAttributes,
  fiscalCode: FiscalCode,
  profileModel: ProfileModel,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: ReadonlyArray<ServiceId>,
  servicesPreferencesModel: ServicesPreferencesModel,
  serviceActivationModel: ActivationModel,
  canSendMessageOnActivation: ReturnType<
    typeof canSendMessageOnActivationWithGrace
  >,
  telemetryClient: ReturnType<typeof initTelemetryClient>
  // eslint-disable-next-line max-params
): Task<IGetLimitedProfileResponses> =>
  pipe(
    TE.of(void 0),
    TE.chain(() =>
      // Sandboxed accounts will receive 403
      // if they're not authorized to send a messages to this fiscal code.
      // This prevents leaking the information, to sandboxed account,
      // that the fiscal code belongs to a subscribed user
      pipe(
        canWriteMessage(
          apiAuthorization.groups,
          userAttributes.service.authorizedRecipients,
          fiscalCode
        ),
        TE.fromEither,
        TE.mapLeft(_ => ResponseErrorForbiddenNotAuthorizedForRecipient)
      )
    ), // Verify if the Service has the required quality to sent message
    TE.chain(_ => {
      if (
        disableIncompleteServices &&
        !incompleteServiceWhitelist.includes(
          userAttributes.service.serviceId
        ) &&
        !userAttributes.service.authorizedRecipients.has(fiscalCode)
      ) {
        return pipe(
          userAttributes.service,
          ValidService.decode,
          E.bimap(
            _1 => ResponseErrorForbiddenNotAuthorizedForRecipient,
            _1 => true
          ),
          TE.fromEither
        );
      }
      return TE.fromEither(E.right(true));
    }),
    TE.chainW(_ =>
      pipe(
        profileModel.findLastVersionByModelId([fiscalCode]),
        TE.mapLeft(error =>
          ResponseErrorQuery("Error while retrieving the profile", error)
        )
      )
    ),
    TE.chainW(
      TE.fromPredicate(
        maybeProfile =>
          O.isSome(maybeProfile) && maybeProfile.value.isInboxEnabled,
        _ =>
          ResponseErrorNotFound(
            "Profile not found",
            "The profile you requested was not found in the system."
          )
      )
    ),
    TE.chain(
      TE.fromOption(() => {
        throw new Error(
          "You should not be here: profileModel.findLastVersionByModelId option result should already be tested."
        );
      })
    ),
    TE.chain(profile =>
      pipe(
        O.fromNullable(userAttributes.service.serviceMetadata),
        O.map(serviceMetadata => serviceMetadata.category),
        TE.fromPredicate(
          category =>
            O.isSome(category) &&
            category.value === SpecialServiceCategoryEnum.SPECIAL,
          identity
        ),
        TE.fold(
          // Non SPECIAL Service
          () => {
            // To determine allowance, use a different algorithm depending in subscription mode
            const isSenderAllowedTask =
              profile.servicePreferencesSettings.mode ===
              ServicesPreferencesModeEnum.LEGACY
                ? isSenderAllowedLegacy(
                    profile.blockedInboxOrChannels,
                    userAttributes.service.serviceId
                  )
                : isSenderAllowed(
                    servicesPreferencesModel,
                    userAttributes.service.serviceId,
                    profile.fiscalCode,
                    profile.servicePreferencesSettings
                  );

            return pipe(
              isSenderAllowedTask,
              TE.bimap(
                error =>
                  error.kind === "UNEXPECTED_VALUE"
                    ? ResponseErrorInternal(`Unexpected mode: ${error.value}`)
                    : ResponseErrorQuery(
                        "Failed to read preference for the given service",
                        error
                      ),
                isAllowed => ({
                  isAllowed,
                  profile
                })
              ),
              TE.map(_ => {
                telemetryClient.trackEvent({
                  name: "api.limitedprofile.sender-allowed",
                  properties: {
                    fiscalCode: toHash(profile.fiscalCode),
                    isAllowed: String(_.isAllowed),
                    mode: profile.servicePreferencesSettings.mode,
                    serviceId: userAttributes.service.serviceId
                  },
                  tagOverrides: { samplingEnabled: "false" }
                });
                return _;
              })
            );
          },
          // SPECIAL service
          () =>
            pipe(
              serviceActivationModel.findLastVersionByModelId([
                userAttributes.service.serviceId,
                profile.fiscalCode
              ]),
              TE.map(canSendMessageOnActivation),
              TE.map(isAllowed => ({ isAllowed, profile })),
              TE.mapLeft(_ =>
                ResponseErrorInternal(
                  "Error while retrieving the user service activation"
                )
              )
            )
        )
      )
    ),
    TE.map(({ isAllowed, profile }) =>
      ResponseSuccessJson(retrievedProfileToLimitedProfile(profile, isAllowed))
    ),
    TE.toUnion
  );
