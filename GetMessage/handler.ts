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

import { MessageModel, MessageWithContent, MessageWithoutContent, RetrievedMessage } from "@pagopa/io-functions-commons/dist/src/models/message";

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
import { MessageResponseWithContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageResponseWithContent";
import { MessageResponseWithoutContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageResponseWithoutContent";
import { MessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { pipe } from "fp-ts/lib/function";
import * as t from "io-ts";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { LegalData } from "../generated/definitions/LegalData";

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
    MessageResponseWithContent | MessageResponseWithoutContent
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
    const isUserAllowedForLegalMessages =
      [...auth.groups].indexOf(UserGroup.ApiLegalMessageRead) >= 0;

    // the service is allowed to see the message when he is the sender of the message
    const isUserAllowed = (message: RetrievedMessage) => message.senderServiceId === userAttributes.service.serviceId ||
      isUserAllowedForLegalMessages ? TE.right(message) : TE.left(ResponseErrorForbiddenNotAuthorized);

    // fetch the content of the message from the blob storage
    const retrieveContent = ({ document }: { document: RetrievedMessage }) => pipe(document,
      (document) => messageModel.getContentFromBlob(blobService, document.id),
      TE.mapLeft(error => {
        context.log.error(`GetMessageHandler|${JSON.stringify(error)}`);
        //line to check with attention during PR
        return ResponseErrorInternal(`${(error as Error).name}: ${(error as Error).message}`);
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

    return await pipe(messageModel.findMessageForRecipient(fiscalCode, messageId),
      // the query failed
      TE.mapLeft((err) => ResponseErrorQuery(
        "Error while retrieving the message",
        err
      )),
      // the document does not exist
      TE.chainW((maybeDocument) => pipe(maybeDocument, TE.fromOption(() => ResponseErrorNotFound(
        "Message not found",
        "The message that you requested was not found in the system.")
      ))),
      //check if the user is allowed to see the message
      TE.chainW((document) => isUserAllowed(document)),
      // fetch the content of the message from the blob storage
      TE.mapLeft((error) => {
        context.log.error(
          `GetMessageHandler|${JSON.stringify(error)}`
        );
        return error;
      }),
      TE.bindTo('document'),
      TE.bindW('content', retrieveContent),
      TE.bindW('message', ({ document, content }) => TE.of({
        content,
        ...retrievedMessageToPublic(document)
      })),
      TE.bindW('notification', ({ document }) => pipe(
        getMessageNotificationStatuses(
          notificationModel,
          notificationStatusModel,
          document.id
        ),
        TE.mapLeft((error) => ResponseErrorInternal(
          `Error retrieving NotificationStatus: ${(error as Error).name}|${(error as Error).message}`
        )),
        TE.map(O.toUndefined)
      )
      ),
      TE.bindW('status', ({ document }) => pipe(
        messageStatusModel.findLastVersionByModelId([document.id]),
        TE.mapLeft((error) => ResponseErrorInternal(
          `Error retrieving MessageStatus: ${JSON.stringify(
            error
          )}`
        )),
        TE.map((maybeMessageStatus) => pipe(maybeMessageStatus,
          O.map(messageStatus => messageStatus.status),
          // when the message has been received but a MessageStatus
          // does not exist yet, the message is considered to be
          // in the ACCEPTED state (not yet stored in the inbox)
          O.getOrElse(() => MessageStatusValueEnum.ACCEPTED))
        ),
      )
      ),
      TE.map(messageToReturn =>
      ({
        message: messageToReturn.message,
        notification: messageToReturn.notification,
        // we do not return the status date-time
        status: messageToReturn.status
      })
      ),
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
