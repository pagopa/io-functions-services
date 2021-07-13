import * as t from "io-ts";

import { Context } from "@azure/functions";
import {
  BlockedInboxOrChannel,
  BlockedInboxOrChannelEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { CreatedMessageEvent } from "@pagopa/io-functions-commons/dist/src/models/created_message_event";
import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import { BlobService } from "azure-storage";
import { isLeft } from "fp-ts/lib/Either";
import { fromNullable, isNone } from "fp-ts/lib/Option";
import { readableReport } from "italia-ts-commons/lib/reporters";
import {
  makeServicesPreferencesDocumentId,
  ServicePreference,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";
import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import {
  ServicesPreferencesMode,
  ServicesPreferencesModeEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import { identity } from "fp-ts/lib/function";
import {
  fromLeft,
  fromPredicate,
  taskEither,
  TaskEither
} from "fp-ts/lib/TaskEither";
import { isBefore } from "date-fns";
import { UTCISODateFromString } from "@pagopa/ts-commons/lib/dates";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { initTelemetryClient } from "../utils/appinsights";

export const SuccessfulStoreMessageContentActivityResult = t.interface({
  blockedInboxOrChannels: t.readonlyArray(BlockedInboxOrChannel),
  kind: t.literal("SUCCESS"),
  profile: RetrievedProfile
});

export type SuccessfulStoreMessageContentActivityResult = t.TypeOf<
  typeof SuccessfulStoreMessageContentActivityResult
>;

export const FailedStoreMessageContentActivityResult = t.interface({
  kind: t.literal("FAILURE"),
  reason: t.keyof({
    // see https://github.com/gcanti/io-ts#union-of-string-literals
    BAD_DATA: null,
    MASTER_INBOX_DISABLED: null,
    PERMANENT_ERROR: null,
    PROFILE_NOT_FOUND: null,
    SENDER_BLOCKED: null
  })
});

export type FailedStoreMessageContentActivityResult = t.TypeOf<
  typeof FailedStoreMessageContentActivityResult
>;

export const StoreMessageContentActivityResult = t.taggedUnion("kind", [
  SuccessfulStoreMessageContentActivityResult,
  FailedStoreMessageContentActivityResult
]);

export type StoreMessageContentActivityResult = t.TypeOf<
  typeof StoreMessageContentActivityResult
>;

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

export type ServicePreferenceValueOrError = (params: {
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
  "serviceId" | "fiscalCode" | "settingsVersion"
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
  taskEither
    .of<ServicePreferenceError, ServicesPreferencesMode>(
      userServicePreferencesMode
    )
    .chain(
      fromPredicate(
        mode => mode !== ServicesPreferencesModeEnum.LEGACY,
        skippedMode
      )
    )
    .map(_ =>
      makeServicesPreferencesDocumentId(
        fiscalCode,
        serviceId,
        userServicePreferencesVersion as NonNegativeInteger
      )
    )
    .chain(documentId =>
      servicePreferencesModel
        .find([documentId, fiscalCode])
        .mapLeft<ServicePreferenceError>(identity)
    )
    .chain(maybeServicePref =>
      maybeServicePref.foldL<
        TaskEither<
          ServicePreferenceError,
          ReadonlyArray<BlockedInboxOrChannelEnum>
        >
      >(
        () =>
          // if we do not have a preference we return an empty array only
          // if we have preference mode AUTO, else we must return an array
          // with BlockedInboxOrChannelEnum.INBOX
          userServicePreferencesMode === ServicesPreferencesModeEnum.AUTO
            ? taskEither.of([])
            : userServicePreferencesMode === ServicesPreferencesModeEnum.MANUAL
            ? taskEither.of([BlockedInboxOrChannelEnum.INBOX])
            : // The following code should never happen
            // LEGACY is managed above and any other case should be managed explicitly
            userServicePreferencesMode === ServicesPreferencesModeEnum.LEGACY
            ? fromLeft(skippedMode(userServicePreferencesMode))
            : fromLeft(unexpectedValue(userServicePreferencesMode)),
        s => taskEither.of(servicePreferenceToBlockedInboxOrChannels(s))
      )
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
  lBlobService: BlobService,
  createdMessageEvent: CreatedMessageEvent
): Promise<void> => {
  const newMessageWithoutContent = createdMessageEvent.message;
  const logPrefix = `StoreMessageContentActivity|MESSAGE_ID=${newMessageWithoutContent.id}`;

  // Save the content of the message to the blob storage.
  // In case of a retry this operation will overwrite the message content with itself
  // (this is fine as we don't know if the operation succeeded at first)
  const errorOrAttachment = await lMessageModel
    .storeContentAsBlob(
      lBlobService,
      newMessageWithoutContent.id,
      createdMessageEvent.content
    )
    .run();

  if (isLeft(errorOrAttachment)) {
    context.log.error(`${logPrefix}|ERROR=${errorOrAttachment.value}`);
    throw new Error("Error while storing message content");
  }

  // Now that the message content has been stored, we can make the message
  // visible to getMessages by changing the pending flag to false
  const updatedMessageOrError = await lMessageModel
    .upsert({
      ...newMessageWithoutContent,
      isPending: false
    })
    .run();

  if (isLeft(updatedMessageOrError)) {
    context.log.error(
      `${logPrefix}|ERROR=${JSON.stringify(updatedMessageOrError.value)}`
    );
    throw new Error("Error while updating message pending status");
  }
};

export interface IStoreMessageContentActivityHandlerInput {
  readonly lProfileModel: ProfileModel;
  readonly lMessageModel: MessageModel;
  readonly lBlobService: BlobService;
  readonly lServicePreferencesModel: ServicesPreferencesModel;
  readonly optOutEmailSwitchDate: UTCISODateFromString;
  readonly isOptInEmailEnabled: boolean;
  readonly telemetryClient: ReturnType<typeof initTelemetryClient>;
}

/**
 * Returns a function for handling storeMessageContentActivity
 */
export const getStoreMessageContentActivityHandler = ({
  lProfileModel,
  lMessageModel,
  lBlobService,
  lServicePreferencesModel,
  optOutEmailSwitchDate,
  isOptInEmailEnabled,
  telemetryClient
}: IStoreMessageContentActivityHandlerInput) => async (
  context: Context,
  input: unknown
): Promise<StoreMessageContentActivityResult> => {
  const createdMessageEventOrError = CreatedMessageEvent.decode(input);

  if (createdMessageEventOrError.isLeft()) {
    context.log.error(
      `StoreMessageContentActivity|Unable to parse CreatedMessageEvent`
    );
    context.log.verbose(
      `StoreMessageContentActivity|ERROR_DETAILS=${readableReport(
        createdMessageEventOrError.value
      )}`
    );
    return { kind: "FAILURE", reason: "BAD_DATA" };
  }

  const createdMessageEvent = createdMessageEventOrError.value;

  const newMessageWithoutContent = createdMessageEvent.message;

  const logPrefix = `StoreMessageContentActivity|MESSAGE_ID=${newMessageWithoutContent.id}`;

  context.log.verbose(`${logPrefix}|STARTING`);

  // fetch user's profile associated to the fiscal code
  // of the recipient of the message
  const errorOrMaybeProfile = await lProfileModel
    .findLastVersionByModelId([newMessageWithoutContent.fiscalCode])
    .run();

  if (isLeft(errorOrMaybeProfile)) {
    // The query has failed, we consider this as a transient error.
    // It's *critical* to trigger a retry here, otherwise no message
    // content will be saved.
    context.log.error(
      `${logPrefix}|ERROR=${JSON.stringify(errorOrMaybeProfile.value)}`
    );
    throw Error("Error while fetching profile");
  }

  const maybeProfile = errorOrMaybeProfile.value;

  if (isNone(maybeProfile)) {
    // the recipient doesn't have any profile yet
    context.log.warn(`${logPrefix}|RESULT=PROFILE_NOT_FOUND`);
    return { kind: "FAILURE", reason: "PROFILE_NOT_FOUND" };
  }

  const profile = maybeProfile.value;

  //
  //  Inbox storage
  //

  // a profile exists and the global inbox flag is enabled
  const isInboxEnabled = profile.isInboxEnabled === true;

  if (!isInboxEnabled) {
    // the recipient's inbox is disabled
    context.log.warn(`${logPrefix}|RESULT=MASTER_INBOX_DISABLED`);
    return { kind: "FAILURE", reason: "MASTER_INBOX_DISABLED" };
  }

  //
  // check Service Preferences Settings
  //
  const blockedInboxOrChannels = await getServicePreferenceValueOrError(
    lServicePreferencesModel
  )({
    fiscalCode: newMessageWithoutContent.fiscalCode,
    serviceId: newMessageWithoutContent.senderServiceId,
    userServicePreferencesMode: profile.servicePreferencesSettings.mode,
    userServicePreferencesVersion: profile.servicePreferencesSettings.version
  })
    .fold<ReadonlyArray<BlockedInboxOrChannelEnum>>(servicePreferenceError => {
      if (servicePreferenceError.kind !== "INVALID_MODE") {
        // The query has failed, we consider this as a transient error.
        context.log.error(`${logPrefix}|${servicePreferenceError.kind}`);
        throw Error("Error while retrieving user's service preference");
      }

      // channels the user has blocked for this sender service
      const result = fromNullable(profile.blockedInboxOrChannels)
        .chain(bc => fromNullable(bc[newMessageWithoutContent.senderServiceId]))
        .getOrElse([]);

      context.log.verbose(
        `${logPrefix}|BLOCKED_CHANNELS=${JSON.stringify(result)}`
      );

      return result;
    }, identity)
    .run();

  // check whether the user has blocked inbox storage for messages from this sender
  const isMessageStorageBlockedForService =
    blockedInboxOrChannels.indexOf(BlockedInboxOrChannelEnum.INBOX) >= 0;

  telemetryClient.trackEvent({
    name: "api.messages.create.blockedstoremessage",
    properties: {
      isBlocked: String(isMessageStorageBlockedForService),
      messageId: createdMessageEvent.message.id,
      mode: profile.servicePreferencesSettings.mode,
      senderId: createdMessageEvent.message.senderServiceId
    },
    tagOverrides: { samplingEnabled: "false" }
  });

  if (isMessageStorageBlockedForService) {
    context.log.warn(`${logPrefix}|RESULT=SENDER_BLOCKED`);
    return { kind: "FAILURE", reason: "SENDER_BLOCKED" };
  }

  await createMessageOrThrow(
    context,
    lMessageModel,
    lBlobService,
    createdMessageEvent
  );

  context.log.verbose(`${logPrefix}|RESULT=SUCCESS`);

  return {
    blockedInboxOrChannels,
    kind: "SUCCESS",
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
  };
};
