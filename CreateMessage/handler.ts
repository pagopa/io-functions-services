/*
 * Implements the API handlers for the Message resource.
 */
import { Context } from "@azure/functions";

import * as express from "express";

import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import * as T from "fp-ts/lib/Task";

import * as t from "io-ts";

import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { EUCovidCert } from "@pagopa/io-functions-commons/dist/generated/definitions/EUCovidCert";
import {
  Message,
  MessageModel,
  NewMessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  ServiceModel,
  ValidService
} from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  AzureAllowBodyPayloadMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import { ClientIp } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";
import {
  ObjectIdGenerator,
  ulidGenerator
} from "@pagopa/io-functions-commons/dist/src/utils/strings";

import { initAppInsights } from "@pagopa/ts-commons/lib/appinsights";
import { readableReportSimplified } from "@pagopa/ts-commons/lib/reporters";
import {
  IResponseErrorForbiddenAnonymousUser,
  IResponseErrorForbiddenNoAuthorizationGroups,
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorForbiddenNotAuthorizedForProduction,
  IResponseErrorForbiddenNotAuthorizedForRecipient,
  IResponseErrorInternal,
  IResponseErrorValidation,
  IResponseSuccessRedirectToResource,
  ResponseErrorForbiddenNotAuthorizedForProduction,
  ResponseErrorForbiddenNotAuthorizedForRecipient,
  ResponseErrorInternal,
  ResponseErrorValidation,
  ResponseSuccessRedirectToResource
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { PromiseType } from "@pagopa/ts-commons/lib/types";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { Option } from "fp-ts/lib/Option";
import { Either } from "fp-ts/lib/Either";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { PaymentDataWithRequiredPayee } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentDataWithRequiredPayee";
import { NewMessage as ApiNewMessage } from "@pagopa/io-functions-commons/dist/generated/definitions/NewMessage";
import { StandardServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/StandardServiceCategory";
import {
  CommonMessageData,
  CreatedMessageEvent
} from "../utils/events/message";
import { commonCreateMessageMiddlewares } from "../utils/message_middlewares";
import { LegalData } from "../generated/definitions/LegalData";
import {
  ApiNewMessageWithAdvancedFeatures,
  ApiNewMessageWithContentOf,
  ApiNewMessageWithDefaults,
  ApiNewThirdPartyMessage
} from "./types";
import { makeUpsertBlobFromObject } from "./utils";

/**
 * Type of a CreateMessage handler.
 *
 * CreateMessage expects an Azure Function Context and FiscalCode as input
 * and returns the created Message as output.
 * The Context is needed to output the created Message to a queue for
 * further processing.
 */
type ICreateMessageHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes,
  messagePayload: ApiNewMessageWithDefaults,
  maybeFiscalCode: Option<FiscalCode>
) => Promise<
  // eslint-disable-next-line @typescript-eslint/ban-types
  | IResponseSuccessRedirectToResource<Message, {}>
  | IResponseErrorInternal
  | IResponseErrorQuery
  | IResponseErrorValidation
  | IResponseErrorForbiddenNoAuthorizationGroups
  | IResponseErrorForbiddenAnonymousUser
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorForbiddenNotAuthorizedForRecipient
  | IResponseErrorForbiddenNotAuthorizedForProduction
>;

export type CreateMessageHandlerResponse = PromiseType<
  ReturnType<ICreateMessageHandler>
>;

/**
 * Checks whether the client service can create a new message for the recipient
 */
export const canWriteMessage = (
  authGroups: IAzureApiAuthorization["groups"],
  authorizedRecipients: IAzureUserAttributes["service"]["authorizedRecipients"],
  fiscalCode: FiscalCode
): Either<
  | IResponseErrorForbiddenNotAuthorizedForRecipient
  | IResponseErrorForbiddenNotAuthorizedForProduction,
  true
> => {
  // check whether the user is authorized to send messages to limited recipients
  // or whether the user is authorized to send messages to any recipient
  if (authGroups.has(UserGroup.ApiLimitedMessageWrite)) {
    // user is in limited message creation mode, check whether he's sending
    // the message to an authorized recipient
    if (!authorizedRecipients.has(fiscalCode)) {
      return E.left(ResponseErrorForbiddenNotAuthorizedForRecipient);
    }
  } else if (!authGroups.has(UserGroup.ApiMessageWrite)) {
    // the user is doing a production call but he's not enabled
    return E.left(ResponseErrorForbiddenNotAuthorizedForProduction);
  }

  return E.right(true);
};

/**
 * Checks whether the client service is allowed to request a payment to the
 * user and whether the amount is below the allowed limit.
 */
export const canPaymentAmount = (
  messageContent: ApiNewMessage["content"],
  maxAllowedPaymentAmount: IAzureUserAttributes["service"]["maxAllowedPaymentAmount"]
): Either<IResponseErrorValidation, true> => {
  const requestedAmount = messageContent.payment_data
    ? messageContent.payment_data.amount
    : undefined;

  const hasExceededAmount =
    requestedAmount && requestedAmount > maxAllowedPaymentAmount;

  // check if the service wants to charge a valid amount to the user
  if (hasExceededAmount) {
    return E.left(
      ResponseErrorValidation(
        "Error while sending payment metadata",
        `The requested amount (${requestedAmount} cents) exceeds the maximum allowed for this service (${maxAllowedPaymentAmount} cents)`
      )
    );
  }
  return E.right(true);
};

/**
 * Creates a new Message in the Messages collection.
 *
 * Note that this function only creates the metadata document, the content of
 * the message is stored in a blob by an async activity.
 */
export const createMessageDocument = (
  messageId: NonEmptyString,
  messageModel: MessageModel,
  senderUserId: IAzureApiAuthorization["userId"],
  recipientFiscalCode: FiscalCode,
  timeToLiveSeconds: ApiNewMessageWithDefaults["time_to_live"],
  featureLevelType: ApiNewMessageWithDefaults["feature_level_type"],
  serviceId: IAzureUserAttributes["service"]["serviceId"]
): TaskEither<
  IResponseErrorInternal | IResponseErrorQuery,
  NewMessageWithoutContent
  // eslint-disable-next-line max-params
> => {
  // create a new message from the payload
  // this object contains only the message metadata, the content of the
  // message is handled separately (see below).
  const newMessageWithoutContent: NewMessageWithoutContent = {
    createdAt: new Date(),
    featureLevelType,
    fiscalCode: recipientFiscalCode,
    id: messageId,
    indexedId: messageId,
    isPending: true,
    kind: "INewMessageWithoutContent",
    senderServiceId: serviceId,
    senderUserId,
    timeToLiveSeconds
  };

  //
  // handle real message creation requests
  //

  // attempt to create the message
  return pipe(
    messageModel.create(newMessageWithoutContent),
    TE.mapLeft(e =>
      e.kind === "COSMOS_ERROR_RESPONSE"
        ? ResponseErrorInternal(JSON.stringify(e))
        : ResponseErrorQuery("Error while creating Message", e)
    ),
    TE.map(() => newMessageWithoutContent)
  );
};

/**
 * Returns a redirect response for a newly created Message.
 */
const redirectToNewMessage = (
  newMessageWithoutContent: NewMessageWithoutContent
  // eslint-disable-next-line @typescript-eslint/ban-types
): IResponseSuccessRedirectToResource<Message, {}> =>
  ResponseSuccessRedirectToResource(
    newMessageWithoutContent,
    `/api/v1/messages/${newMessageWithoutContent.fiscalCode}/${newMessageWithoutContent.id}`,
    { id: newMessageWithoutContent.id }
  );

/**
 * Returns a type safe CreateMessage handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions,max-params
export function CreateMessageHandler(
  telemetryClient: ReturnType<typeof initAppInsights>,
  messageModel: MessageModel,
  generateObjectId: ObjectIdGenerator,
  saveProcessingMessage: ReturnType<typeof makeUpsertBlobFromObject>,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: ReadonlyArray<ServiceId>,
  sandboxFiscalCode: NonEmptyString
): ICreateMessageHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (
    context,
    auth,
    __,
    userAttributes,
    messagePayload,
    maybeFiscalCodeInPath
    // eslint-disable-next-line max-params
  ) => {
    const maybeFiscalCodeInPayload = O.fromNullable(messagePayload.fiscal_code);

    // The fiscal_code parameter must be specified in the path or in the payload but not in both
    if (O.isSome(maybeFiscalCodeInPath) && O.isSome(maybeFiscalCodeInPayload)) {
      return ResponseErrorValidation(
        "Bad parameters",
        "The fiscalcode parameter must be specified in the path or in the payload but not in both"
      );
    }

    const maybeFiscalCode = pipe(
      maybeFiscalCodeInPath,
      O.alt(() => maybeFiscalCodeInPayload)
    );
    if (O.isNone(maybeFiscalCode)) {
      return ResponseErrorValidation(
        "Bad parameters",
        "The fiscalcode parameter must be specified in the path or in the payload"
      );
    }

    const fiscalCode = maybeFiscalCode.value;
    const { service, email: serviceUserEmail } = userAttributes;
    const { authorizedRecipients, serviceId } = service;

    // a new message ID gets generated for each request, even for requests that
    // fail as it's used as a unique operation identifier in application
    // insights
    const messageId = generateObjectId();

    // helper function used to track the message creation event in application
    // insights
    const trackResponse = (
      r: CreateMessageHandlerResponse,
      isSuccess: boolean,
      isSandbox: boolean
    ): void =>
      telemetryClient.trackEvent({
        name: "api.messages.create",
        properties: {
          error: isSuccess ? undefined : r.kind,
          messageId,
          sandbox: isSandbox ? "true" : "false",
          senderServiceId: serviceId,
          senderUserId: auth.userId,
          success: isSuccess ? "true" : "false"
        },
        tagOverrides: { samplingEnabled: "false" }
      });

    // helper function that logs the result of the handler
    const logResponse = (
      r: CreateMessageHandlerResponse,
      isSuccess: boolean
    ): void =>
      context.log.verbose(
        `CreateMessageHandler|SERVICE_ID=${serviceId}|RESPONSE=${r.kind}|${
          r.detail
        }|RESULT=${isSuccess ? "SUCCESS" : "FAILURE"}`
      );

    // here we create an async Task that processes the request
    return pipe(
      // check whether the client can create a message for the recipient
      TE.fromEither(
        canWriteMessage(auth.groups, authorizedRecipients, fiscalCode)
      ),
      // Verify if the Service has the required quality to sent message
      TE.chain(_ =>
        disableIncompleteServices &&
        !incompleteServiceWhitelist.includes(serviceId) &&
        !authorizedRecipients.has(fiscalCode)
          ? TE.fromEither(
              pipe(
                ValidService.decode(userAttributes.service),
                E.bimap(
                  _1 => ResponseErrorForbiddenNotAuthorizedForRecipient,
                  _1 => true
                )
              )
            )
          : TE.right(true)
      ),
      TE.chainW(_ =>
        // check whether the client can ask for payment
        TE.fromEither(
          canPaymentAmount(
            messagePayload.content,
            service.maxAllowedPaymentAmount
          )
        )
      ),
      TE.chainW(_ =>
        // create a Message document in the database
        createMessageDocument(
          messageId,
          messageModel,
          auth.userId,
          fiscalCode,
          messagePayload.time_to_live,
          messagePayload.feature_level_type,
          serviceId
        )
      ),
      // store CommonMessageData into a support storage
      TE.chainFirstW(newMessageWithoutContent =>
        pipe(
          saveProcessingMessage(
            newMessageWithoutContent.id,
            CommonMessageData.encode({
              content: messagePayload.content,
              message: newMessageWithoutContent,
              senderMetadata: {
                departmentName: service.departmentName,
                organizationFiscalCode: service.organizationFiscalCode,
                organizationName: service.organizationName,
                requireSecureChannels: service.requireSecureChannels,
                serviceCategory: pipe(
                  O.fromNullable(service.serviceMetadata?.category),
                  O.getOrElse(() => StandardServiceCategoryEnum.STANDARD)
                ),
                serviceName: service.serviceName,
                serviceUserEmail
              }
            })
          ),
          TE.mapLeft(err => {
            context.log.error(
              `CreateMessageHandler|Error storing processing message to blob|${err.message}`
            );
            return ResponseErrorInternal("Unable to store processing message");
          })
        )
      ),

      // processing the message asynchrnously
      TE.chain(newMessageWithoutContent =>
        pipe(
          {
            defaultAddresses: {}, // deprecated feature
            messageId: newMessageWithoutContent.id,
            serviceVersion: service.version
          },
          CreatedMessageEvent.decode,
          TE.fromEither,
          TE.mapLeft(err =>
            ResponseErrorValidation(
              "Unable to decode CreatedMessageEvent",
              readableReportSimplified(err)
            )
          ),
          TE.map(createdMessage => {
            // eslint-disable-next-line functional/immutable-data
            context.bindings.createdMessage = createdMessage;
            return redirectToNewMessage(newMessageWithoutContent);
          })
        )
      ),
      // fold failure responses (left) and success responses (right) to a
      // single response
      TE.toUnion,
      T.map(r => {
        // before returning the response to the client we log the result
        const isSuccess = r.kind === "IResponseSuccessRedirectToResource";
        const isSandbox = fiscalCode.toString() === sandboxFiscalCode;
        trackResponse(r, isSuccess, isSandbox);
        logResponse(r, isSuccess);
        return r;
      })
    )();
  };
}

/**
 * Wraps a CreateMessage handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, max-params
export function CreateMessage(
  telemetryClient: ReturnType<typeof initAppInsights>,
  serviceModel: ServiceModel,
  messageModel: MessageModel,
  saveProcessingMessage: ReturnType<typeof makeUpsertBlobFromObject>,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: ReadonlyArray<ServiceId>,
  sandboxFiscalCode: NonEmptyString
): express.RequestHandler {
  const handler = CreateMessageHandler(
    telemetryClient,
    messageModel,
    ulidGenerator,
    saveProcessingMessage,
    disableIncompleteServices,
    incompleteServiceWhitelist,
    sandboxFiscalCode
  );
  const middlewaresWrap = withRequestMiddlewares(
    ...([
      // Common CreateMessage Middlewares
      ...commonCreateMessageMiddlewares(serviceModel),
      AzureAllowBodyPayloadMiddleware(
        ApiNewMessageWithContentOf(t.interface({ eu_covid_cert: EUCovidCert })),
        new Set([UserGroup.ApiMessageWriteEUCovidCert]),
        "You do not have enough permissions to send an EUCovidCert message"
      ),
      // Ensures only users in ApiMessageWriteWithPayee group can send payment messages with payee payload
      AzureAllowBodyPayloadMiddleware(
        ApiNewMessageWithContentOf(
          t.interface({ payment_data: PaymentDataWithRequiredPayee })
        ),
        new Set([UserGroup.ApiMessageWriteWithPayee]),
        "You do not have enough permissions to send a payment message with payee"
      ),
      // Ensures only users in ApiMessageWriteWithLegalDataWithoutImpersonification group can send legal messages
      AzureAllowBodyPayloadMiddleware(
        ApiNewMessageWithContentOf(t.interface({ legal_data: LegalData })),
        new Set([
          UserGroup.ApiMessageWriteWithLegalDataWithoutImpersonification
        ]),
        "You do not have enough permissions to send a legal message"
      ),
      // Allow only users in the ApiMessageWriteAdvanced group to send messages with "ADVANCED" feature_type
      AzureAllowBodyPayloadMiddleware(
        ApiNewMessageWithAdvancedFeatures,
        new Set([UserGroup.ApiMessageWriteAdvanced]),
        "You do not have enough permissions to send a Premium message"
      ),
      // Allow only users in the ApiThirdPartyMessageWrite group to send messages with ThirdPartyData
      AzureAllowBodyPayloadMiddleware(
        ApiNewThirdPartyMessage,
        new Set([UserGroup.ApiThirdPartyMessageWrite]),
        "You do not have enough permissions to send a third party message"
      )
    ] as const)
  );
  return wrapRequestHandler(
    middlewaresWrap(
      // eslint-disable-next-line max-params
      checkSourceIpForHandler(handler, (_, __, c, u, ___, ____, _____) =>
        ipTuple(c, u)
      )
    )
  );
}
