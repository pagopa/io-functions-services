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
} from "italia-ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";

import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";

import { NotificationModel } from "@pagopa/io-functions-commons/dist/src/models/notification";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";

import { BlobService } from "azure-storage";

import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";

import { isLeft } from "fp-ts/lib/Either";
import { isNone } from "fp-ts/lib/Option";

import { MessageStatusModel } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { NotificationStatusModel } from "@pagopa/io-functions-commons/dist/src/models/notification_status";

import {
  getMessageNotificationStatuses,
  retrievedMessageToPublic
} from "@pagopa/io-functions-commons/dist/src/utils/messages";

import { Context } from "@azure/functions";
import { MessageResponseWithContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageResponseWithContent";
import { MessageResponseWithoutContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageResponseWithoutContent";
import { MessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { readableReport } from "italia-ts-commons/lib/reporters";

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
  // tslint:disable-next-line:max-union-size
  | IResponseSuccessJson<
      MessageResponseWithContent | MessageResponseWithoutContent
    >
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseErrorValidation
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
>;

/**
 * Handles requests for getting a single message for a recipient.
 */
export function GetMessageHandler(
  messageModel: MessageModel,
  messageStatusModel: MessageStatusModel,
  notificationModel: NotificationModel,
  notificationStatusModel: NotificationStatusModel,
  blobService: BlobService
): IGetMessageHandler {
  return async (context, _, __, userAttributes, fiscalCode, messageId) => {
    const errorOrMessageId = NonEmptyString.decode(messageId);

    if (errorOrMessageId.isLeft()) {
      return ResponseErrorValidation(
        "Invalid messageId",
        readableReport(errorOrMessageId.value)
      );
    }
    const errorOrMaybeDocument = await messageModel
      .findMessageForRecipient(fiscalCode, errorOrMessageId.value)
      .run();

    if (isLeft(errorOrMaybeDocument)) {
      // the query failed
      return ResponseErrorQuery(
        "Error while retrieving the message",
        errorOrMaybeDocument.value
      );
    }

    const maybeDocument = errorOrMaybeDocument.value;
    if (isNone(maybeDocument)) {
      // the document does not exist
      return ResponseErrorNotFound(
        "Message not found",
        "The message that you requested was not found in the system."
      );
    }

    const retrievedMessage = maybeDocument.value;

    // the service is allowed to see the message when he is the sender of the message
    const isUserAllowed =
      retrievedMessage.senderServiceId === userAttributes.service.serviceId;

    if (!isUserAllowed) {
      // the user is not allowed to see the message
      return ResponseErrorForbiddenNotAuthorized;
    }

    // fetch the content of the message from the blob storage
    const errorOrMaybeContent = await messageModel
      .getContentFromBlob(blobService, retrievedMessage.id)
      .run();

    if (isLeft(errorOrMaybeContent)) {
      context.log.error(
        `GetMessageHandler|${JSON.stringify(errorOrMaybeContent.value)}`
      );
      return ResponseErrorInternal(
        `${errorOrMaybeContent.value.name}: ${errorOrMaybeContent.value.message}`
      );
    }

    const content = errorOrMaybeContent.value.toUndefined();

    const message = {
      content,
      ...retrievedMessageToPublic(retrievedMessage)
    };

    const errorOrNotificationStatuses = await getMessageNotificationStatuses(
      notificationModel,
      notificationStatusModel,
      retrievedMessage.id
    ).run();

    if (isLeft(errorOrNotificationStatuses)) {
      return ResponseErrorInternal(
        `Error retrieving NotificationStatus: ${errorOrNotificationStatuses.value.name}|${errorOrNotificationStatuses.value.message}`
      );
    }
    const notificationStatuses = errorOrNotificationStatuses.value;

    const errorOrMaybeMessageStatus = await messageStatusModel
      .findLastVersionByModelId([retrievedMessage.id])
      .run();

    if (isLeft(errorOrMaybeMessageStatus)) {
      return ResponseErrorInternal(
        `Error retrieving MessageStatus: ${JSON.stringify(
          errorOrMaybeMessageStatus.value
        )}`
      );
    }
    const maybeMessageStatus = errorOrMaybeMessageStatus.value;

    const returnedMessage = {
      message,
      notification: notificationStatuses.toUndefined(),
      // we do not return the status date-time
      status: maybeMessageStatus
        .map(messageStatus => messageStatus.status)
        // when the message has been received but a MessageStatus
        // does not exist yet, the message is considered to be
        // in the ACCEPTED state (not yet stored in the inbox)
        .getOrElse(MessageStatusValueEnum.ACCEPTED)
    };

    return ResponseSuccessJson(returnedMessage);
  };
}

/**
 * Wraps a GetMessage handler inside an Express request handler.
 */
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
    AzureApiAuthMiddleware(new Set([UserGroup.ApiMessageRead])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    FiscalCodeMiddleware,
    RequiredParamMiddleware("id", NonEmptyString)
  );
  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___, ____) =>
        ipTuple(c, u)
      )
    )
  );
}
