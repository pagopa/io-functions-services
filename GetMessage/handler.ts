import * as express from "express";

import {
  ClientIp,
  ClientIpMiddleware
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";

import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";

import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";

import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import {
  AzureUserAttributesMiddleware,
  IAzureUserAttributes
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import { FiscalCodeMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/fiscalcode";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorValidation,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";

import { NotificationModel } from "@pagopa/io-functions-commons/dist/src/models/notification";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";

import { BlobService } from "azure-storage";

import { MessageModel, RetrievedMessage } from "@pagopa/io-functions-commons/dist/src/models/message";

import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

import {
  MessageStatusModel,
  RetrievedMessageStatus
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { NotificationStatusModel } from "@pagopa/io-functions-commons/dist/src/models/notification_status";

import {
  getMessageNotificationStatuses,
  retrievedMessageToPublic
} from "@pagopa/io-functions-commons/dist/src/utils/messages";

import { Context } from "@azure/functions";
import { ExternalMessageResponseWithContent } from "@pagopa/io-functions-commons/dist/generated/definitions/ExternalMessageResponseWithContent";
import { ExternalMessageResponseWithoutContent } from "@pagopa/io-functions-commons/dist/generated/definitions/ExternalMessageResponseWithoutContent";
import { ExternalCreatedMessageWithContent } from "@pagopa/io-functions-commons/dist/generated/definitions/ExternalCreatedMessageWithContent";
import { ExternalCreatedMessageWithoutContent } from "@pagopa/io-functions-commons/dist/generated/definitions/ExternalCreatedMessageWithoutContent";
import { MessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { pipe } from "fp-ts/lib/function";
import * as t from "io-ts";
import * as B from "fp-ts/lib/boolean";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import {
  ReadStatus,
  ReadStatusEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/ReadStatus";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { LegalData } from "../generated/definitions/LegalData";
import { FeatureLevelTypeEnum } from "../generated/definitions/FeatureLevelType";

/**
 * Converts a retrieved message to a message that can be shared via API
 */
export const retrievedMessageToExternal = (
  retrievedMessage: RetrievedMessage
): ExternalCreatedMessageWithoutContent => ({
  ...retrievedMessageToPublic(retrievedMessage),
  feature_level_type: retrievedMessage.featureLevelType
});

/**
 * Type of a GetMessage handler.
 *
 * GetMessage expects a FiscalCode and a Message ID as input
 * and returns a Message as output or a Not Found or Validation
 * errors.
 */
type IGetMessageHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes,
  fiscalCode: FiscalCode,
  messageId: NonEmptyString
) => Promise<
  | IResponseSuccessJson<
    ExternalMessageResponseWithContent | ExternalMessageResponseWithoutContent
  >
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseErrorValidation
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
>;

const LegalMessagePattern = t.interface({ legal_data: LegalData });
type LegalMessagePattern = t.TypeOf<typeof LegalMessagePattern>;

/**
 * Checks whether the client service can read advanced message info (read_status and payment_Status)
 */
export const canReadAdvancedMessageInfo = (
  message:
    | ExternalCreatedMessageWithoutContent
    | ExternalCreatedMessageWithContent,
  authGroups: IAzureApiAuthorization["groups"]
): boolean =>
  message.feature_level_type === FeatureLevelTypeEnum.ADVANCED &&
  authGroups.has(UserGroup.ApiMessageReadAdvanced);

// TODO: waiting for opt-out definition on profiles domain
/**
 * Checks whether the client service can read message read status
 *
 * @param serviceId the subscription id of the service
 * @returns false if user revoked the permission to access the read status, true otherwise
 */
export const canReadMessageReadStatus = (_serviceId: ServiceId): boolean =>
  false;

/**
 * Return a ReadStatusEnum
 *
 * @param maybeMessageStatus an Option of MessageStatus
 * @returns READ if message status exists and isRead is set to true, UNREAD otherwise
 */
export const getReadStatusForService = (
  maybeMessageStatus: O.Option<RetrievedMessageStatus>
): ReadStatus =>
  pipe(
    maybeMessageStatus,
    O.map(messageStatus => messageStatus.isRead),
    O.map(
      B.fold(
        () => ReadStatusEnum.UNREAD,
        () => ReadStatusEnum.READ
      )
    ),
    O.getOrElse(() => ReadStatusEnum.UNREAD)
  );

/**
 * Handles requests for getting a single message for a recipient.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetMessageHandler(
  messageModel: MessageModel,
  messageStatusModel: MessageStatusModel,
  notificationModel: NotificationModel,
  notificationStatusModel: NotificationStatusModel,
  blobService: BlobService
): IGetMessageHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, max-params
  return async (context, auth, __, userAttributes, fiscalCode, messageId) => {
    const isUserAllowedForLegalMessages =
      [...auth.groups].indexOf(UserGroup.ApiLegalMessageRead) >= 0;

    // the service is allowed to see the message when he is the sender of the message
    const isUserAllowed = TE.fromPredicate((message: RetrievedMessage) => message.senderServiceId === userAttributes.service.serviceId ||
      isUserAllowedForLegalMessages, () => ResponseErrorForbiddenNotAuthorized)

    // fetch the content of the message from the blob storage
    const retrieveContent = ({ document }: { document: RetrievedMessage }) => pipe(document,
      (document) => messageModel.getContentFromBlob(blobService, document.id),
      TE.mapLeft(error => {
        context.log.error(`GetMessageHandler|${JSON.stringify(error)}`);
        return ResponseErrorInternal(`${error.name}: ${error.message}`);
      }),
      TE.chainW(
        O.fold(
          () =>
            isUserAllowedForLegalMessages
              ? TE.left(
                ResponseErrorNotFound(
                  "Not Found",
                  "Message Content not found"
                )
              )
              : TE.of(O.none),
          messageContent =>
            pipe(
              messageContent,
              LegalMessagePattern.decode,
              TE.fromEither,
              TE.map(() => O.some(messageContent)),
              TE.orElse(_ =>
                !isUserAllowedForLegalMessages
                  ? TE.of(O.some(messageContent))
                  : TE.left<
                    | IResponseErrorForbiddenNotAuthorized
                    | IResponseErrorNotFound,
                    O.Option<MessageContent>
                  >(ResponseErrorForbiddenNotAuthorized)
              )
            )
        )
      ),
      TE.map(O.toUndefined)
    )

    return await pipe(
      messageModel.findMessageForRecipient(fiscalCode, messageId),
      // the query failed
      TE.mapLeft((err) => ResponseErrorQuery(
        "Error while retrieving the message",
        err
      )),
      // the document does not exist
      TE.chainW(TE.fromOption(() =>
        ResponseErrorNotFound(
          "Message not found",
          "The message that you requested was not found in the system."
        )
      )),
      //check if the user is allowed to see the message
      TE.chainW(isUserAllowed),
      TE.bindTo('document'),
      TE.bindW('content', retrieveContent),
      TE.bindW('message', ({ document, content }) => TE.of({
        content,
        ...retrievedMessageToExternal(document)
      })),
      TE.bindW('notification', ({ document }) => pipe(
        getMessageNotificationStatuses(
          notificationModel,
          notificationStatusModel,
          document.id
        ),
        TE.mapLeft((error) => ResponseErrorInternal(
          `Error retrieving NotificationStatus: ${error.name}|${error.message}`
        )),
        TE.map(O.toUndefined)
      )
      ),
      TE.bindW("maybeMessageStatus", ({ document }) => pipe(
        messageStatusModel.findLastVersionByModelId([document.id]),
        TE.mapLeft((error) => ResponseErrorInternal(
          `Error retrieving MessageStatus: ${JSON.stringify(
            error
          )}`
        ))
      )),
      TE.bindW('status', ({ maybeMessageStatus }) => pipe(
        maybeMessageStatus,
        O.map((messageStatus) => messageStatus.status),
        // when the message has been received but a MessageStatus
        // does not exist yet, the message is considered to be
        // in the ACCEPTED state (not yet stored in the inbox)
        O.getOrElse(() => MessageStatusValueEnum.ACCEPTED),
        TE.of
      )
      ),

      TE.bindW("maybeReadStatus", ({ message, maybeMessageStatus }) => pipe(
        canReadAdvancedMessageInfo(message, auth.groups) ? O.some(true) : O.none,
        O.map(() => pipe(
          canReadMessageReadStatus(auth.subscriptionId),
          B.fold(
            () => ReadStatusEnum.UNAVAILABLE,
            () => getReadStatusForService(maybeMessageStatus)
          )
        )),
        TE.of
      )),

      TE.map(({ message, notification, status, maybeReadStatus }) => pipe(
        maybeReadStatus,
        O.fold(
          () => ({ message, notification, status }),
          //Enrich message info with advanced properties if user is allowed to read them
          (read_status) => ({ message, notification, status, read_status }),
        )
      )),

      TE.map(message => ResponseSuccessJson(message)),
      TE.toUnion
    )();
  };
}

/**
 * Wraps a GetMessage handler inside an Express request handler.
 */
// eslint-disable-next-line max-params, prefer-arrow/prefer-arrow-functions
export function GetMessage(
  serviceModel: ServiceModel,
  messageModel: MessageModel,
  messageStatusModel: MessageStatusModel,
  notificationModel: NotificationModel,
  notificationStatusModel: NotificationStatusModel,
  blobService: BlobService
): express.RequestHandler {
  const handler = GetMessageHandler(
    messageModel,
    messageStatusModel,
    notificationModel,
    notificationStatusModel,
    blobService
  );
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(
      new Set([UserGroup.ApiMessageRead, UserGroup.ApiLegalMessageRead])
    ),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    FiscalCodeMiddleware,
    RequiredParamMiddleware("id", NonEmptyString)
  );
  return wrapRequestHandler(
    middlewaresWrap(
      // eslint-disable-next-line max-params
      checkSourceIpForHandler(handler, (_, __, c, u, ___, ____) =>
        ipTuple(c, u)
      )
    )
  );
}
