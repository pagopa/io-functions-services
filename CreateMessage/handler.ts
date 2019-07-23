/*
 * Implements the API handlers for the Message resource.
 */
import { Context } from "@azure/functions";

import * as express from "express";

import * as df from "durable-functions";

import { Either, isLeft, left, right } from "fp-ts/lib/Either";
import { identity, Lazy } from "fp-ts/lib/function";
import { fromEither, TaskEither, tryCatch } from "fp-ts/lib/TaskEither";

import * as t from "io-ts";

import { FiscalCode } from "io-functions-commons/dist/generated/definitions/FiscalCode";
import { NewMessage as ApiNewMessage } from "io-functions-commons/dist/generated/definitions/NewMessage";
import { TimeToLiveSeconds } from "io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import { CreatedMessageEvent } from "io-functions-commons/dist/src/models/created_message_event";
import {
  Message,
  MessageModel,
  NewMessageWithoutContent
} from "io-functions-commons/dist/src/models/message";
import { ServiceModel } from "io-functions-commons/dist/src/models/service";
import { CustomTelemetryClientFactory } from "io-functions-commons/dist/src/utils/application_insights";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import {
  AzureUserAttributesMiddleware,
  IAzureUserAttributes
} from "io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import {
  ClientIp,
  ClientIpMiddleware
} from "io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { FiscalCodeMiddleware } from "io-functions-commons/dist/src/utils/middlewares/fiscalcode";
import {
  IRequestMiddleware,
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "io-functions-commons/dist/src/utils/response";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "io-functions-commons/dist/src/utils/source_ip_check";
import {
  ObjectIdGenerator,
  ulidGenerator
} from "io-functions-commons/dist/src/utils/strings";

import { readableReport } from "italia-ts-commons/lib/reporters";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorForbiddenNotAuthorizedForDefaultAddresses,
  IResponseErrorForbiddenNotAuthorizedForProduction,
  IResponseErrorForbiddenNotAuthorizedForRecipient,
  IResponseErrorInternal,
  IResponseErrorValidation,
  IResponseSuccessRedirectToResource,
  ResponseErrorForbiddenNotAuthorizedForDefaultAddresses,
  ResponseErrorForbiddenNotAuthorizedForProduction,
  ResponseErrorForbiddenNotAuthorizedForRecipient,
  ResponseErrorFromValidationErrors,
  ResponseErrorInternal,
  ResponseErrorValidation,
  ResponseSuccessRedirectToResource
} from "italia-ts-commons/lib/responses";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { PromiseType } from "italia-ts-commons/lib/types";

const ApiNewMessageWithDefaults = t.intersection([
  ApiNewMessage,
  t.interface({ time_to_live: TimeToLiveSeconds })
]);
export type ApiNewMessageWithDefaults = t.TypeOf<
  typeof ApiNewMessageWithDefaults
>;

/**
 * A request middleware that validates the Message payload.
 */
export const MessagePayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  ApiNewMessageWithDefaults
> = request =>
  new Promise(resolve => {
    return resolve(
      ApiNewMessageWithDefaults.decode(request.body).mapLeft(
        ResponseErrorFromValidationErrors(ApiNewMessageWithDefaults)
      )
    );
  });

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
  fiscalCode: FiscalCode,
  messagePayload: ApiNewMessageWithDefaults
) => Promise<
  // tslint:disable-next-line:max-union-size
  | IResponseSuccessRedirectToResource<Message, {}>
  | IResponseErrorInternal
  | IResponseErrorQuery
  | IResponseErrorValidation
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorForbiddenNotAuthorizedForRecipient
  | IResponseErrorForbiddenNotAuthorizedForProduction
  | IResponseErrorForbiddenNotAuthorizedForDefaultAddresses
>;

type CreateMessageHandlerResponse = PromiseType<
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
      return left(ResponseErrorForbiddenNotAuthorizedForRecipient);
    }
  } else if (!authGroups.has(UserGroup.ApiMessageWrite)) {
    // the user is doing a production call but he's not enabled
    return left(ResponseErrorForbiddenNotAuthorizedForProduction);
  }

  return right(true);
};

/**
 * Checks whether the client service can provide default email addresses.
 *
 * Note that this feature is deprecated and the handler will always respond with
 * a Forbidden response if default addresses are provided.
 */
export const canDefaultAddresses = (
  messagePayload: ApiNewMessage
): Either<IResponseErrorForbiddenNotAuthorizedForDefaultAddresses, true> => {
  // check whether the user is authorized to provide default addresses
  if (messagePayload.default_addresses) {
    // sending messages with default addresses is deprecated, always
    // respond with a forbidden status
    return left(ResponseErrorForbiddenNotAuthorizedForDefaultAddresses);
  }
  return right(true);
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
    return left(
      ResponseErrorValidation(
        "Error while sending payment metadata",
        `The requested amount (${requestedAmount} cents) exceeds the maximum allowed for this service (${maxAllowedPaymentAmount} cents)`
      )
    );
  }
  return right(true);
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
  serviceId: IAzureUserAttributes["service"]["serviceId"]
): TaskEither<
  IResponseErrorInternal | IResponseErrorQuery,
  NewMessageWithoutContent
> => {
  // create a new message from the payload
  // this object contains only the message metadata, the content of the
  // message is handled separately (see below).
  const newMessageWithoutContent: NewMessageWithoutContent = {
    createdAt: new Date(),
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
  const createMessageTask = tryCatch(
    () =>
      messageModel.create(
        newMessageWithoutContent,
        newMessageWithoutContent.fiscalCode // partition key
      ),
    e => ResponseErrorInternal(String(e))
  );

  return createMessageTask
    .mapLeft<IResponseErrorInternal | IResponseErrorQuery>(identity)
    .chain(r =>
      fromEither(r).mapLeft(e =>
        ResponseErrorQuery("Error while creating Message", e)
      )
    )
    .map(() => newMessageWithoutContent);
};

/**
 * Forks the durable function orchestrator that will further process the message
 * asynchronously (storing the content into a blob, delivering notifications).
 */
export const forkOrchestrator = (
  getDfClient: Lazy<ReturnType<typeof df.getClient>>,
  messageContent: ApiNewMessageWithDefaults["content"],
  service: IAzureUserAttributes["service"],
  newMessageWithoutContent: NewMessageWithoutContent
): TaskEither<IResponseErrorValidation | IResponseErrorInternal, string> => {
  //
  // emit created message event to the output queue
  //

  // prepare the created message event
  // we filter out undefined values as they are
  // deserialized to null(s) when enqueued
  const createdMessageEventOrError = CreatedMessageEvent.decode({
    content: messageContent,
    defaultAddresses: {}, // deprecated feature
    message: newMessageWithoutContent,
    senderMetadata: {
      departmentName: service.departmentName,
      organizationFiscalCode: service.organizationFiscalCode,
      organizationName: service.organizationName,
      serviceName: service.serviceName
    },
    serviceVersion: service.version
  });

  if (isLeft(createdMessageEventOrError)) {
    return fromEither(
      left(
        ResponseErrorValidation(
          "Unable to decode CreatedMessageEvent",
          readableReport(createdMessageEventOrError.value)
        )
      )
    );
  }

  // queue the message to the created messages queue by setting
  // the message to the output binding of this function
  // tslint:disable-next-line:no-object-mutation
  // context.bindings.createdMessage = createdMessageEventOrError.value;
  const dfClient = getDfClient();
  return tryCatch(
    () =>
      dfClient.startNew(
        "CreatedMessageOrchestrator",
        undefined,
        createdMessageEventOrError.value
      ),
    e => ResponseErrorInternal(String(e))
  );
};

/**
 * Returns a redirect response for a newly created Message.
 */
const redirectToNewMessage = (
  newMessageWithoutContent: NewMessageWithoutContent
): IResponseSuccessRedirectToResource<Message, {}> =>
  ResponseSuccessRedirectToResource(
    newMessageWithoutContent,
    `/api/v1/messages/${newMessageWithoutContent.fiscalCode}/${newMessageWithoutContent.id}`,
    { id: newMessageWithoutContent.id }
  );

/**
 * Returns a type safe CreateMessage handler.
 */
export function CreateMessageHandler(
  getCustomTelemetryClient: CustomTelemetryClientFactory,
  messageModel: MessageModel,
  generateObjectId: ObjectIdGenerator
): ICreateMessageHandler {
  return async (
    context,
    auth,
    __,
    userAttributes,
    fiscalCode,
    messagePayload
  ) => {
    const { service } = userAttributes;
    const { authorizedRecipients, serviceId } = service;

    // a new message ID gets generated for each request, even for requests that
    // fail as it's used as a unique operation identifier in application
    // insights
    const messageId = generateObjectId();

    // configure a telemetry client for application insights
    const telemetryClient = getCustomTelemetryClient(
      {
        // each tracked event is associated to the messageId
        operationId: messageId,
        serviceId
      },
      {
        messageId
      }
    );

    // helper function used to track the message creation event in application
    // insights
    const trackResponse = (
      r: CreateMessageHandlerResponse,
      isSuccess: boolean
    ): void =>
      telemetryClient.trackEvent({
        name: "api.messages.create",
        properties: {
          error: isSuccess ? undefined : r.kind,
          hasDefaultEmail: Boolean(
            messagePayload.default_addresses &&
              messagePayload.default_addresses.email
          ).toString(),
          senderServiceId: serviceId,
          senderUserId: auth.userId,
          success: isSuccess ? "true" : "false"
        }
      });

    // helper function that logs the result of the handler
    const logResponse = (
      r: CreateMessageHandlerResponse,
      isSuccess: boolean
    ): void =>
      context.log.verbose(
        `CreateMessageHandler|${
          isSuccess ? "SUCCESS" : "FAILURE"
        }|SERVICE_ID=${serviceId}|RECIPIENT=${fiscalCode}|RESPONSE=${r.kind}|${
          r.detail
        }`
      );

    // here we create an async Task that processes the request
    const task =
      // this is a dummy value, it's just used to set the type of error
      // see https://github.com/gcanti/fp-ts/issues/528#issuecomment-407749612
      fromEither<CreateMessageHandlerResponse, boolean>(right(true))
        .chainSecond(
          // check whether the client can create a message for the recipient
          fromEither(
            canWriteMessage(auth.groups, authorizedRecipients, fiscalCode)
          )
        )
        .chainSecond(
          // check whether the client can provide default addresses
          fromEither(canDefaultAddresses(messagePayload))
        )
        .chainSecond(
          // check whether the client can ask for payment
          fromEither(
            canPaymentAmount(
              messagePayload.content,
              service.maxAllowedPaymentAmount
            )
          )
        )
        .chainSecond(
          // create a Message document in the database
          createMessageDocument(
            messageId,
            messageModel,
            auth.userId,
            fiscalCode,
            messagePayload.time_to_live,
            serviceId
          )
        )
        .chain(newMessageWithoutContent =>
          // fork the durable function orchestrator that will complete
          // processing the message asynchrnously
          forkOrchestrator(
            () => df.getClient(context),
            messagePayload.content,
            service,
            newMessageWithoutContent
          ).map(() => redirectToNewMessage(newMessageWithoutContent))
        )
        // fold failure responses (left) and success responses (right) to a
        // single response
        .fold(identity, identity)
        .map(r => {
          // before returning the response to the client we log the result
          const isSuccess = r.kind === "IResponseSuccessRedirectToResource";
          trackResponse(r, isSuccess);
          logResponse(r, isSuccess);
          return r;
        });

    return task.run();
  };
}

/**
 * Wraps a CreateMessage handler inside an Express request handler.
 */
export function CreateMessage(
  getCustomTelemetryClient: CustomTelemetryClientFactory,
  serviceModel: ServiceModel,
  messageModel: MessageModel
): express.RequestHandler {
  const handler = CreateMessageHandler(
    getCustomTelemetryClient,
    messageModel,
    ulidGenerator
  );
  const middlewaresWrap = withRequestMiddlewares(
    // extract Azure Functions bindings
    ContextMiddleware(),
    // allow only users in the ApiMessageWrite and ApiMessageWriteLimited groups
    AzureApiAuthMiddleware(
      new Set([UserGroup.ApiMessageWrite, UserGroup.ApiLimitedMessageWrite])
    ),
    // extracts the client IP from the request
    ClientIpMiddleware,
    // extracts custom user attributes from the request
    AzureUserAttributesMiddleware(serviceModel),
    // extracts the fiscal code from the request params
    FiscalCodeMiddleware,
    // extracts the create message payload from the request body
    MessagePayloadMiddleware
  );
  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___, ____) =>
        ipTuple(c, u)
      )
    )
  );
}
