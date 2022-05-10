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
  ResponseErrorValidation,
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

import {
  MessageModel,
  RetrievedMessage
} from "@pagopa/io-functions-commons/dist/src/models/message";

import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";

import { MessageStatusModel } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { NotificationStatusModel } from "@pagopa/io-functions-commons/dist/src/models/notification_status";

import {
  getMessageNotificationStatuses,
  retrievedMessageToPublic
} from "@pagopa/io-functions-commons/dist/src/utils/messages";

import { Context } from "@azure/functions";
import { ExternalMessageResponseWithContent } from "@pagopa/io-functions-commons/dist/generated/definitions/ExternalMessageResponseWithContent";
import { ExternalMessageResponseWithoutContent } from "@pagopa/io-functions-commons/dist/generated/definitions/ExternalMessageResponseWithoutContent";
import { ExternalCreatedMessageWithoutContent } from "@pagopa/io-functions-commons/dist/generated/definitions/ExternalCreatedMessageWithoutContent";
import { MessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { pipe } from "fp-ts/lib/function";
import * as t from "io-ts";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { LegalData } from "../generated/definitions/LegalData";

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
  messageId: string
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
    const errorOrMessageId = NonEmptyString.decode(messageId);

    if (E.isLeft(errorOrMessageId)) {
      return ResponseErrorValidation(
        "Invalid messageId",
        readableReport(errorOrMessageId.left)
      );
    }
    const errorOrMaybeDocument = await messageModel.findMessageForRecipient(
      fiscalCode,
      errorOrMessageId.right
    )();

    if (E.isLeft(errorOrMaybeDocument)) {
      // the query failed
      return ResponseErrorQuery(
        "Error while retrieving the message",
        errorOrMaybeDocument.left
      );
    }

    const maybeDocument = errorOrMaybeDocument.right;
    if (O.isNone(maybeDocument)) {
      // the document does not exist
      return ResponseErrorNotFound(
        "Message not found",
        "The message that you requested was not found in the system."
      );
    }

    const retrievedMessage = maybeDocument.value;

    const isUserAllowedForLegalMessages =
      [...auth.groups].indexOf(UserGroup.ApiLegalMessageRead) >= 0;
    // the service is allowed to see the message when he is the sender of the message
    const isUserAllowed =
      retrievedMessage.senderServiceId === userAttributes.service.serviceId ||
      isUserAllowedForLegalMessages;

    if (!isUserAllowed) {
      // the user is not allowed to see the message
      return ResponseErrorForbiddenNotAuthorized;
    }

    // fetch the content of the message from the blob storage
    const errorOrMaybeContent = await pipe(
      messageModel.getContentFromBlob(blobService, retrievedMessage.id),
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
      )
    )();

    if (E.isLeft(errorOrMaybeContent)) {
      context.log.error(
        `GetMessageHandler|${JSON.stringify(errorOrMaybeContent.left)}`
      );
      return errorOrMaybeContent.left;
    }

    const content = O.toUndefined(errorOrMaybeContent.right);

    const message = {
      content,
      ...retrievedMessageToExternal(retrievedMessage)
    };

    const errorOrNotificationStatuses = await getMessageNotificationStatuses(
      notificationModel,
      notificationStatusModel,
      retrievedMessage.id
    )();

    if (E.isLeft(errorOrNotificationStatuses)) {
      return ResponseErrorInternal(
        `Error retrieving NotificationStatus: ${errorOrNotificationStatuses.left.name}|${errorOrNotificationStatuses.left.message}`
      );
    }
    const notificationStatuses = errorOrNotificationStatuses.right;

    const errorOrMaybeMessageStatus = await messageStatusModel.findLastVersionByModelId(
      [retrievedMessage.id]
    )();

    if (E.isLeft(errorOrMaybeMessageStatus)) {
      return ResponseErrorInternal(
        `Error retrieving MessageStatus: ${JSON.stringify(
          errorOrMaybeMessageStatus.left
        )}`
      );
    }
    const maybeMessageStatus = errorOrMaybeMessageStatus.right;

    const returnedMessage = {
      message,
      notification: pipe(notificationStatuses, O.toUndefined),
      // we do not return the status date-time
      status: pipe(
        maybeMessageStatus,
        O.map(messageStatus => messageStatus.status),
        // when the message has been received but a MessageStatus
        // does not exist yet, the message is considered to be
        // in the ACCEPTED state (not yet stored in the inbox)
        O.getOrElse(() => MessageStatusValueEnum.ACCEPTED)
      )
    };

    return ResponseSuccessJson(returnedMessage);
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
