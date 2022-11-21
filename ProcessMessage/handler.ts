/* eslint-disable max-lines-per-function */

import { Context } from "@azure/functions";
import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { EUCovidCert } from "@pagopa/io-functions-commons/dist/generated/definitions/EUCovidCert";
import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { RejectedMessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/RejectedMessageStatusValue";
import { NotRejectedMessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotRejectedMessageStatusValue";
import { PaymentDataWithRequiredPayee } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentDataWithRequiredPayee";
import {
  ServicesPreferencesMode,
  ServicesPreferencesModeEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import { ActivationModel } from "@pagopa/io-functions-commons/dist/src/models/activation";
import {
  MessageModel,
  MessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  getMessageStatusUpdater,
  MessageStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { ProfileModel } from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  makeServicesPreferencesDocumentId,
  ServicePreference,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { UTCISODateFromString } from "@pagopa/ts-commons/lib/dates";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { Second } from "@pagopa/ts-commons/lib/units";
import { BlobService } from "azure-storage";
import { isBefore } from "date-fns";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as T from "fp-ts/lib/Task";
import * as TE from "fp-ts/lib/TaskEither";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { RejectionReasonEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/RejectionReason";
import { Ttl } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model_ttl";
import { SpecialServiceCategoryEnum } from "../generated/api-admin/SpecialServiceCategory";
import { LegalData } from "../generated/definitions/LegalData";
import { PaymentData } from "../generated/definitions/PaymentData";
import { ThirdPartyData } from "../generated/definitions/ThirdPartyData";
import { initTelemetryClient } from "../utils/appinsights";
import { toHash } from "../utils/crypto";
import {
  CommonMessageData,
  CreatedMessageEvent,
  ProcessedMessageEvent
} from "../utils/events/message";
import { withDecodedInput } from "../utils/with-decoded-input";
import { DataFetcher, withExpandedInput } from "../utils/with-expanded-input";
import { withJsonInput } from "../utils/with-json-input";
import { canSendMessageOnActivationWithGrace } from "../utils/services";

// Interface that marks an unexpected value
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

// Interface that marks a skipped service preference mode value
interface ISkippedMode {
  readonly kind: "INVALID_MODE";
  readonly message: NonEmptyString;
}

/**
 * Creates a ISkippedMode error object
 *
 * @param value the unexpected value
 * @returns a formatted IUnexpectedValue error
 */
const skippedMode = (mode: ServicesPreferencesModeEnum): ISkippedMode => ({
  kind: "INVALID_MODE",
  message: `${mode} is managed as default` as NonEmptyString
});

type ServicePreferenceError = ISkippedMode | CosmosErrors | IUnexpectedValue;

type ServicePreferenceValueOrError = (params: {
  readonly serviceId: NonEmptyString;
  readonly fiscalCode: FiscalCode;
  readonly userServicePreferencesMode: ServicesPreferencesMode;
  readonly userServicePreferencesVersion: number;
}) => TaskEither<
  ServicePreferenceError,
  ReadonlyArray<BlockedInboxOrChannelEnum>
>;

type ServicePreferencesValues = Omit<
  ServicePreference,
  "serviceId" | "fiscalCode" | "settingsVersion" | "accessReadMessageStatus"
>;

const channelToBlockedInboxOrChannelEnum: {
  readonly [key in keyof ServicePreferencesValues]: BlockedInboxOrChannelEnum;
} = {
  isEmailEnabled: BlockedInboxOrChannelEnum.EMAIL,
  isInboxEnabled: BlockedInboxOrChannelEnum.INBOX,
  isWebhookEnabled: BlockedInboxOrChannelEnum.WEBHOOK
};

const servicePreferenceToBlockedInboxOrChannels: (
  servicePreference: ServicePreference
) => ReadonlyArray<BlockedInboxOrChannelEnum> = servicePreference =>
  /**
   * Reduce the complexity of User's preferences into an array of BlockedInboxOrChannelEnum
   * In case a preference is set to false, it is translated to proper BlockedInboxOrChannelEnum
   * and added to returned array.
   * By adding a `channelToBlockedInboxOrChannelEnum` map we are prepared to handle new
   * service preferences
   */
  Object.entries(servicePreference)
    // take only attributes of ServicePreferencesValues
    .filter(([name, _]) => channelToBlockedInboxOrChannelEnum[name])
    // take values set to false
    .filter(([_, isEnabled]) => !isEnabled)
    // map to BlockedInboxOrChannelEnum
    .map(([name, _]) => channelToBlockedInboxOrChannelEnum[name]);

/**
 * Converts a preference to a remapped blockedInboxOrChannels if it exists
 * or goes left for legacy or unexpected modes and any cosmos error.
 *
 * @param servicePreferencesModel
 * @returns
 */
const getServicePreferenceValueOrError = (
  servicePreferencesModel: ServicesPreferencesModel
): ServicePreferenceValueOrError => ({
  fiscalCode,
  serviceId,
  userServicePreferencesMode,
  userServicePreferencesVersion
}): TaskEither<
  ServicePreferenceError,
  ReadonlyArray<BlockedInboxOrChannelEnum>
> =>
  pipe(
    TE.of<ServicePreferenceError, ServicesPreferencesMode>(
      userServicePreferencesMode
    ),
    TE.chain(
      TE.fromPredicate(
        mode => mode !== ServicesPreferencesModeEnum.LEGACY,
        skippedMode
      )
    ),
    TE.map(_ =>
      makeServicesPreferencesDocumentId(
        fiscalCode,
        serviceId,
        userServicePreferencesVersion as NonNegativeInteger
      )
    ),
    TE.chainW(documentId =>
      servicePreferencesModel.find([documentId, fiscalCode])
    ),
    TE.chain(maybeServicePref =>
      pipe(
        maybeServicePref,
        O.foldW(
          () =>
            // if we do not have a preference we return an empty array only
            // if we have preference mode AUTO, else we must return an array
            // with BlockedInboxOrChannelEnum.INBOX
            userServicePreferencesMode === ServicesPreferencesModeEnum.AUTO
              ? TE.of([])
              : userServicePreferencesMode ===
                ServicesPreferencesModeEnum.MANUAL
              ? TE.of([BlockedInboxOrChannelEnum.INBOX])
              : // The following code should never happen
              // LEGACY is managed above and any other case should be managed explicitly
              userServicePreferencesMode === ServicesPreferencesModeEnum.LEGACY
              ? TE.left(skippedMode(userServicePreferencesMode))
              : TE.left(unexpectedValue(userServicePreferencesMode)),
          s => TE.of(servicePreferenceToBlockedInboxOrChannels(s))
        )
      )
    )
  );

type BlockedInboxesForSpecialService = (params: {
  readonly senderServiceId: NonEmptyString;
  readonly fiscalCode: FiscalCode;
  readonly context: Context;
  readonly logPrefix: string;
  readonly blockedInboxOrChannel: ReadonlyArray<BlockedInboxOrChannelEnum>;
}) => T.Task<ReadonlyArray<BlockedInboxOrChannelEnum>>;

/**
 * Returns the updated value of `blockedInboxOrChannel` for a Service which is marked as `SPECIAL`.
 *
 * In case the service category field value equals `SPECIAL`, we update the value of the `INBOX` field
 * in the list of user's blocked inboxes (one for each blocked service) according to the service activation status.
 *
 * We try to retrieve the activation status related to the tuple (user, service) from the database.
 * In case the activation status is missing, its value is assumed to be `INACTIVE`.
 * In case the activation status is found to be `ACTIVE` then we remove the INBOX entry
 * from the list of blocked inboxes.
 *
 * @param lActivation
 * @returns
 */
const getBlockedInboxesForSpecialService = (
  lActivation: ActivationModel,
  pendingActivationGracePeriod: Second
): BlockedInboxesForSpecialService => ({
  senderServiceId,
  fiscalCode,
  context,
  logPrefix,
  blockedInboxOrChannel
}): T.Task<ReadonlyArray<BlockedInboxOrChannelEnum>> =>
  pipe(
    lActivation.findLastVersionByModelId([senderServiceId, fiscalCode]),
    TE.mapLeft(activationError => {
      // The query has failed, we consider this as a transient error.
      context.log.error(`${logPrefix}|${activationError.kind}`);
      throw Error("Error while retrieving user's service Activation");
    }),
    TE.map(canSendMessageOnActivationWithGrace(pendingActivationGracePeriod)),
    TE.chainW(
      TE.fromPredicate(
        hasActiveActivation => hasActiveActivation,
        () =>
          blockedInboxOrChannel.includes(BlockedInboxOrChannelEnum.INBOX)
            ? blockedInboxOrChannel
            : [...blockedInboxOrChannel, BlockedInboxOrChannelEnum.INBOX]
      )
    ),
    TE.map(() =>
      blockedInboxOrChannel.filter(el => el !== BlockedInboxOrChannelEnum.INBOX)
    ),
    // Both Left and Right are valid BlockedInboxOrChannelEnum values.
    // The right side contains the blocked inboxes when exists an `ACTIVE` Activation.
    // The left side contains the blocked inboxes when the Activation is missing or has status NOT `ACTIVE`
    TE.toUnion
  );

/**
 * Creates the message and makes it visible or throw an error
 *
 * @param context
 * @param lMessageModel
 * @param lBlobService
 * @param createdMessageEvent
 */
const createMessageOrThrow = async (
  context: Context,
  lMessageModel: MessageModel,
  messageStatusUpdater: ReturnType<typeof getMessageStatusUpdater>,
  lBlobService: BlobService,
  createdMessageEvent: CreatedMessageEvent & CommonMessageData
): Promise<void> => {
  const newMessageWithoutContent = createdMessageEvent.message;
  const logPrefix = context.executionContext.functionName;
  const logPrefixWithMessage = `${logPrefix}|MESSAGE_ID=${newMessageWithoutContent.id}`;

  // If a message is a payment message, we must override payee if it is not specified by sender
  const messagePaymentData = pipe(
    createdMessageEvent.content.payment_data,
    O.fromPredicate(PaymentData.is),
    O.chain(
      flow(
        O.fromPredicate(PaymentDataWithRequiredPayee.is),
        O.getOrElse(() =>
          PaymentDataWithRequiredPayee.encode({
            ...createdMessageEvent.content.payment_data,
            payee: {
              fiscal_code:
                createdMessageEvent.senderMetadata.organizationFiscalCode
            }
          })
        ),
        O.some
      )
    ),
    O.toUndefined
  );

  // Save the content of the message to the blob storage.
  // In case of a retry this operation will overwrite the message content with itself
  // (this is fine as we don't know if the operation succeeded at first)
  const errorOrAttachment = await lMessageModel.storeContentAsBlob(
    lBlobService,
    newMessageWithoutContent.id,
    {
      ...createdMessageEvent.content,
      payment_data: messagePaymentData
    }
  )();

  if (E.isLeft(errorOrAttachment)) {
    context.log.error(
      `${logPrefixWithMessage}|ERROR=${errorOrAttachment.left}`
    );
    throw new Error("Error while storing message content");
  }

  // Save new MessageStatus in PROCESSED status
  // In case it fails, throw an Error and try again
  // NOTE: this will cause message content to be overwritten
  await pipe(
    messageStatusUpdater({
      status: NotRejectedMessageStatusValueEnum.PROCESSED
    }),
    TE.getOrElse(e => {
      context.log.error(
        `${logPrefixWithMessage}|UPSERT_STATUS=PROCESSED|ERROR=${JSON.stringify(
          e
        )}`
      );
      throw new Error("Error while updating message status to PROCESSED");
    })
  )();

  // Now that the message content has been stored, we can make the message
  // visible to getMessages by changing the pending flag to false
  // NOTE: in case of failure, this will cause message content to be overwritten
  // and message-status to create a new version
  const updatedMessageOrError = await lMessageModel.upsert({
    ...newMessageWithoutContent,
    isPending: false
  })();

  if (E.isLeft(updatedMessageOrError)) {
    context.log.error(
      `${logPrefixWithMessage}|ERROR=${JSON.stringify(
        updatedMessageOrError.left
      )}`
    );
    throw new Error("Error while updating message pending status");
  }
};

export interface IProcessMessageHandlerInput {
  readonly TTL_FOR_USER_NOT_FOUND: Ttl;
  readonly isUserEligibleForNewFeature: (fc: FiscalCode) => boolean;
  readonly lActivation: ActivationModel;
  readonly lProfileModel: ProfileModel;
  readonly lMessageModel: MessageModel;
  readonly lBlobService: BlobService;
  readonly lServicePreferencesModel: ServicesPreferencesModel;
  readonly retrieveProcessingMessageData: DataFetcher<CommonMessageData>;
  readonly lMessageStatusModel: MessageStatusModel;
  readonly optOutEmailSwitchDate: UTCISODateFromString;
  readonly isOptInEmailEnabled: boolean;
  readonly telemetryClient: ReturnType<typeof initTelemetryClient>;
  readonly pendingActivationGracePeriod: Second;
}

type Handler = (c: Context, i: unknown) => Promise<void>;

/**
 * Returns a function for handling ProcessMessage
 */
export const getProcessMessageHandler = ({
  TTL_FOR_USER_NOT_FOUND,
  isUserEligibleForNewFeature,
  lActivation,
  lProfileModel,
  lMessageModel,
  lBlobService,
  lServicePreferencesModel,
  lMessageStatusModel,
  retrieveProcessingMessageData,
  optOutEmailSwitchDate,
  isOptInEmailEnabled,
  telemetryClient,
  pendingActivationGracePeriod
}: IProcessMessageHandlerInput): Handler =>
  withJsonInput(
    withDecodedInput(
      CreatedMessageEvent,
      withExpandedInput(
        "messageId",
        retrieveProcessingMessageData,
        async (context, createdMessageEvent) => {
          const newMessageWithoutContent = createdMessageEvent.message;

          const logPrefix = `${context.executionContext.functionName}|MESSAGE_ID=${newMessageWithoutContent.id}`;
          const messageStatusUpdater = getMessageStatusUpdater(
            lMessageStatusModel,
            createdMessageEvent.message.id,
            newMessageWithoutContent.fiscalCode
          );

          context.log.verbose(`${logPrefix}|STARTING`);

          // fetch user's profile associated to the fiscal code
          // of the recipient of the message
          const errorOrMaybeProfile = await lProfileModel.findLastVersionByModelId(
            [newMessageWithoutContent.fiscalCode]
          )();

          if (E.isLeft(errorOrMaybeProfile)) {
            // The query has failed, we consider this as a transient error.
            // It's *critical* to trigger a retry here, otherwise no message
            // content will be saved.
            context.log.error(
              `${logPrefix}|ERROR=${JSON.stringify(errorOrMaybeProfile.left)}`
            );
            throw Error("Error while fetching profile");
          }

          const maybeProfile = errorOrMaybeProfile.right;

          if (O.isNone(maybeProfile)) {
            // the recipient doesn't have any profile yet

            // if the  user is enabled for feature flag we want to execute the new code
            if (
              isUserEligibleForNewFeature(newMessageWithoutContent.fiscalCode)
            ) {
              await pipe(
                messageStatusUpdater({
                  rejection_reason: RejectionReasonEnum.USER_NOT_FOUND,
                  status: RejectedMessageStatusValueEnum.REJECTED,
                  ttl: TTL_FOR_USER_NOT_FOUND
                }),
                TE.mapLeft((err: CosmosErrors) => {
                  telemetryClient.trackEvent({
                    name: "api.messages.create.create-status-fail",
                    properties: {
                      errorKind: "messageStatusUpdater failed",
                      fiscalCode: toHash(newMessageWithoutContent.fiscalCode),
                      messageId: newMessageWithoutContent.id,
                      senderId: newMessageWithoutContent.senderServiceId
                    },
                    tagOverrides: { samplingEnabled: "false" }
                  });
                  context.log.error(
                    `${logPrefix}|PROFILE_NOT_FOUND|UPSERT_STATUS=REJECTED|ERROR=${JSON.stringify(
                      err
                    )}`
                  );
                  throw new Error(
                    "Error while updating message status to REJECTED|PROFILE_NOT_FOUND"
                  );
                }),
                TE.chain(() =>
                  lMessageStatusModel.updateTTLForAllVersions(
                    [newMessageWithoutContent.id],
                    TTL_FOR_USER_NOT_FOUND
                  )
                ),
                TE.mapLeft((error: CosmosErrors) => {
                  telemetryClient.trackEvent({
                    name: "api.messages.create.fail-status-ttl-set",
                    properties: {
                      errorAsJson: JSON.stringify(error),
                      errorKind: error.kind,
                      fiscalCode: toHash(newMessageWithoutContent.fiscalCode),
                      messageId: newMessageWithoutContent.id,
                      senderId: newMessageWithoutContent.senderServiceId
                    },
                    tagOverrides: { samplingEnabled: "false" }
                  });
                  return error;
                }),
                TE.chain(() =>
                  pipe(
                    lMessageModel.patch(
                      [
                        newMessageWithoutContent.id,
                        newMessageWithoutContent.fiscalCode
                      ],
                      // this cast is needed cause patch does not accept ttl
                      { ttl: TTL_FOR_USER_NOT_FOUND } as Partial<
                        MessageWithoutContent
                      >
                    ),
                    TE.mapLeft((error: CosmosErrors) => {
                      telemetryClient.trackEvent({
                        name: "api.messages.create.fail-message-ttl-set",
                        properties: {
                          errorKind: error.kind,
                          fiscalCode: toHash(
                            newMessageWithoutContent.fiscalCode
                          ),
                          messageId: newMessageWithoutContent.id,
                          senderId: newMessageWithoutContent.senderServiceId
                        },
                        tagOverrides: { samplingEnabled: "false" }
                      });
                      return error;
                    })
                  )
                ),
                TE.getOrElse(e => {
                  context.log.error(
                    `${logPrefix}|PROFILE_NOT_FOUND|UPSERT_STATUS=REJECTED|ERROR=${JSON.stringify(
                      e
                    )}`
                  );
                  throw new Error("Error while setting the ttl");
                })
              )();
              // if the user is not enabled for feature flag we just execute the messageStatusUpdater without the ttl
            } else {
              await pipe(
                messageStatusUpdater({
                  rejection_reason: RejectionReasonEnum.USER_NOT_FOUND,
                  status: RejectedMessageStatusValueEnum.REJECTED
                }),
                // eslint-disable-next-line
                TE.getOrElse(e => {
                  context.log.error(
                    `${logPrefix}|PROFILE_NOT_FOUND|UPSERT_STATUS=REJECTED|ERROR=${JSON.stringify(
                      e
                    )}`
                  );
                  throw new Error(
                    "Error while updating message status to REJECTED|PROFILE_NOT_FOUND"
                  );
                })
              )();
            }

            context.log.warn(`${logPrefix}|RESULT=PROFILE_NOT_FOUND`);
            return;
          }

          const profile = maybeProfile.value;

          //
          //  Inbox storage
          //

          // a profile exists and the global inbox flag is enabled
          const isInboxEnabled = profile.isInboxEnabled === true;

          if (!isInboxEnabled) {
            // the recipient's inbox is disabled
            await pipe(
              messageStatusUpdater({
                rejection_reason: RejectionReasonEnum.SERVICE_NOT_ALLOWED,
                status: RejectedMessageStatusValueEnum.REJECTED
              }),
              TE.getOrElse(e => {
                context.log.error(
                  `${logPrefix}|MASTER_INBOX_DISABLED|UPSERT_STATUS=REJECTED|ERROR=${JSON.stringify(
                    e
                  )}`
                );
                throw new Error(
                  "Error while updating message status to REJECTED|MASTER_INBOX_DISABLED"
                );
              })
            )();

            context.log.warn(`${logPrefix}|RESULT=MASTER_INBOX_DISABLED`);
            return;
          }

          //
          // check Service Preferences Settings
          //
          const blockedInboxOrChannels = await pipe(
            getServicePreferenceValueOrError(lServicePreferencesModel)({
              fiscalCode: newMessageWithoutContent.fiscalCode,
              serviceId: newMessageWithoutContent.senderServiceId,
              userServicePreferencesMode:
                profile.servicePreferencesSettings.mode,
              userServicePreferencesVersion:
                profile.servicePreferencesSettings.version
            }),
            TE.mapLeft(servicePreferenceError => {
              if (servicePreferenceError.kind !== "INVALID_MODE") {
                // The query has failed, we consider this as a transient error.
                context.log.error(
                  `${logPrefix}|${servicePreferenceError.kind}`
                );
                throw Error("Error while retrieving user's service preference");
              }

              // channels the user has blocked for this sender service
              const result = pipe(
                O.fromNullable(profile.blockedInboxOrChannels),
                O.chain(bc =>
                  O.fromNullable(bc[newMessageWithoutContent.senderServiceId])
                ),
                O.getOrElse(() => new Array<BlockedInboxOrChannelEnum>())
              );

              context.log.verbose(
                `${logPrefix}|BLOCKED_CHANNELS=${JSON.stringify(result)}`
              );

              return result;
            }),
            TE.toUnion,
            T.chain(blockedInboxOrChannel => {
              if (
                createdMessageEvent.senderMetadata.serviceCategory ===
                SpecialServiceCategoryEnum.SPECIAL
              ) {
                return getBlockedInboxesForSpecialService(
                  lActivation,
                  pendingActivationGracePeriod
                )({
                  blockedInboxOrChannel,
                  context,
                  fiscalCode: newMessageWithoutContent.fiscalCode,
                  logPrefix,
                  senderServiceId: createdMessageEvent.message.senderServiceId
                });
              }
              // If the service is STANDARD we use the original value of blockedInboxOrChannel
              // calculated from services preferences and user profile.
              return T.of(blockedInboxOrChannel);
            })
          )();

          // check whether the user has blocked inbox storage for messages from this sender
          const isMessageStorageBlockedForService =
            blockedInboxOrChannels.indexOf(BlockedInboxOrChannelEnum.INBOX) >=
            0;

          telemetryClient.trackEvent({
            name: "api.messages.create.blockedstoremessage",
            properties: {
              fiscalCode: toHash(profile.fiscalCode),
              isBlocked: String(isMessageStorageBlockedForService),
              messageId: createdMessageEvent.message.id,
              mode: profile.servicePreferencesSettings.mode,
              senderId: createdMessageEvent.message.senderServiceId
            },
            tagOverrides: { samplingEnabled: "false" }
          });

          if (isMessageStorageBlockedForService) {
            await pipe(
              messageStatusUpdater({
                rejection_reason: RejectionReasonEnum.SERVICE_NOT_ALLOWED,
                status: RejectedMessageStatusValueEnum.REJECTED
              }),
              TE.getOrElse(e => {
                context.log.error(
                  `${logPrefix}|SENDER_BLOCKED|UPSERT_STATUS=REJECTED|ERROR=${JSON.stringify(
                    e
                  )}`
                );
                throw new Error(
                  "Error while updating message status to REJECTED|SENDER_BLOCKED"
                );
              })
            )();

            context.log.warn(`${logPrefix}|RESULT=SENDER_BLOCKED`);
            return;
          }

          await createMessageOrThrow(
            context,
            lMessageModel,
            messageStatusUpdater,
            lBlobService,
            createdMessageEvent
          );

          context.log.verbose(`${logPrefix}|RESULT=SUCCESS`);

          telemetryClient.trackEvent({
            name: "api.messages.processed",
            properties: {
              featureLevelType: createdMessageEvent.message.featureLevelType,
              fiscalCode: toHash(profile.fiscalCode),
              hasAttachments:
                createdMessageEvent.content.legal_data?.has_attachment ?? false,
              hasEuCovidCertData: EUCovidCert.is(
                createdMessageEvent.content.eu_covid_cert
              ),
              hasLegalData: LegalData.is(
                createdMessageEvent.content.legal_data
              ),
              hasPaymentData: PaymentData.is(
                createdMessageEvent.content.payment_data
              ),
              hasThirdPartyData: ThirdPartyData.is(
                createdMessageEvent.content.third_party_data
              ),
              messageId: createdMessageEvent.message.id,
              mode: profile.servicePreferencesSettings.mode,
              senderId: createdMessageEvent.message.senderServiceId,
              timeFromCreated:
                Date.now() - newMessageWithoutContent.createdAt.getTime()
            },
            tagOverrides: { samplingEnabled: "false" }
          });

          // eslint-disable-next-line functional/immutable-data
          context.bindings.processedMessage = ProcessedMessageEvent.encode({
            blockedInboxOrChannels,
            messageId: createdMessageEvent.message.id,
            profile: {
              ...profile,
              // if profile's timestamp is before email opt out switch limit date we must force isEmailEnabled to false
              isEmailEnabled:
                isOptInEmailEnabled &&
                // eslint-disable-next-line no-underscore-dangle
                isBefore(profile._ts, optOutEmailSwitchDate)
                  ? false
                  : profile.isEmailEnabled
            }
          });
        }
      )
    )
  );
