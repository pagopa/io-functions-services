/*
 * Implements the API handlers for the Message resource.
 */
import { Context } from "@azure/functions";

import * as express from "express";

import * as df from "durable-functions";

import * as winston from "winston";

import { isLeft } from "fp-ts/lib/Either";
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
import {
  CustomTelemetryClientFactory,
  diffInMilliseconds
} from "io-functions-commons/dist/src/utils/application_insights";
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
  IResponseErrorValidation,
  IResponseSuccessRedirectToResource,
  ResponseErrorForbiddenNotAuthorizedForDefaultAddresses,
  ResponseErrorForbiddenNotAuthorizedForProduction,
  ResponseErrorForbiddenNotAuthorizedForRecipient,
  ResponseErrorFromValidationErrors,
  ResponseErrorValidation,
  ResponseSuccessRedirectToResource
} from "italia-ts-commons/lib/responses";
import { withoutUndefinedValues } from "italia-ts-commons/lib/types";

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
  | IResponseErrorQuery
  | IResponseErrorValidation
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorForbiddenNotAuthorizedForRecipient
  | IResponseErrorForbiddenNotAuthorizedForProduction
  | IResponseErrorForbiddenNotAuthorizedForDefaultAddresses
>;

/**
 * Returns a type safe CreateMessage handler.
 */
// tslint:disable-next-line:cognitive-complexity no-big-function
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
    // tslint:disable-next-line: no-big-function
  ) => {
    // extract the user service
    const userService = userAttributes.service;

    const startRequestTime = process.hrtime();

    // base appinsights event attributes for convenience (used later)
    const appInsightsEventName = "api.messages.create";
    const appInsightsEventProps = {
      hasDefaultEmail: Boolean(
        messagePayload.default_addresses &&
          messagePayload.default_addresses.email
      ).toString(),
      senderServiceId: userService.serviceId,
      senderUserId: auth.userId
    };

    //
    // authorization checks
    //

    // check whether the user is authorized to send messages to limited recipients
    // or whether the user is authorized to send messages to any recipient
    if (auth.groups.has(UserGroup.ApiLimitedMessageWrite)) {
      // user is in limited message creation mode, check whether he's sending
      // the message to an authorized recipient
      if (!userAttributes.service.authorizedRecipients.has(fiscalCode)) {
        return ResponseErrorForbiddenNotAuthorizedForRecipient;
      }
    } else if (!auth.groups.has(UserGroup.ApiMessageWrite)) {
      // the user is doing a production call but he's not enabled
      return ResponseErrorForbiddenNotAuthorizedForProduction;
    }

    // check whether the user is authorized to provide default addresses
    if (
      messagePayload.default_addresses &&
      !auth.groups.has(UserGroup.ApiMessageWriteDefaultAddress)
    ) {
      // the user is sending a message by providing default addresses but he's
      // not allowed to do so.
      return ResponseErrorForbiddenNotAuthorizedForDefaultAddresses;
    }

    const requestedAmount = messagePayload.content.payment_data
      ? messagePayload.content.payment_data.amount
      : undefined;

    const hasExceededAmount =
      requestedAmount &&
      requestedAmount > (userService.maxAllowedPaymentAmount as number);

    // check if the service wants to charge a valid amount to the user
    if (hasExceededAmount) {
      return ResponseErrorValidation(
        "Error while sending payment metadata",
        `The requested amount (${requestedAmount} cents) exceeds the maximum allowed for this service (${userService.maxAllowedPaymentAmount} cents)`
      );
    }

    const id = generateObjectId();

    // create a new message from the payload
    // this object contains only the message metadata, the content of the
    // message is handled separately (see below).
    const newMessageWithoutContent: NewMessageWithoutContent = {
      createdAt: new Date(),
      fiscalCode,
      id,
      indexedId: id,
      isPending: true,
      kind: "INewMessageWithoutContent",
      senderServiceId: userService.serviceId,
      senderUserId: auth.userId,
      timeToLiveSeconds: messagePayload.time_to_live
    };

    //
    // handle real message creation requests
    //

    // attempt to create the message
    const errorOrMessage = await messageModel.create(
      newMessageWithoutContent,
      newMessageWithoutContent.fiscalCode
    );

    const appInsightsClient = getCustomTelemetryClient(
      {
        operationId: newMessageWithoutContent.id,
        serviceId: userService.serviceId
      },
      {
        messageId: newMessageWithoutContent.id
      }
    );

    if (isLeft(errorOrMessage)) {
      // we got an error while creating the message

      // track the event that a message has failed to be created
      appInsightsClient.trackEvent({
        name: appInsightsEventName,
        properties: {
          ...appInsightsEventProps,
          error: "IResponseErrorQuery",
          success: "false"
        }
      });

      winston.debug(
        `CreateMessageHandler|error|${JSON.stringify(errorOrMessage.value)}`
      );

      // return an error response
      return ResponseErrorQuery(
        "Error while creating Message",
        errorOrMessage.value
      );
    }

    // message creation succeeded
    const retrievedMessage = errorOrMessage.value;

    winston.debug(
      `CreateMessageHandler|message created|${userService.serviceId}|${retrievedMessage.id}`
    );

    //
    // emit created message event to the output queue
    //

    // prepare the created message event
    // we filter out undefined values as they are
    // deserialized to null(s) when enqueued
    const createdMessageEventOrError = CreatedMessageEvent.decode(
      withoutUndefinedValues({
        content: messagePayload.content,
        defaultAddresses: messagePayload.default_addresses,
        message: newMessageWithoutContent,
        senderMetadata: {
          departmentName: userAttributes.service.departmentName,
          organizationFiscalCode: userAttributes.service.organizationFiscalCode,
          organizationName: userAttributes.service.organizationName,
          serviceName: userAttributes.service.serviceName
        },
        serviceVersion: userAttributes.service.version
      })
    );

    if (isLeft(createdMessageEventOrError)) {
      winston.error(
        `CreateMessageHandler|Unable to decode CreatedMessageEvent|${
          userService.serviceId
        }|${retrievedMessage.id}|${readableReport(
          createdMessageEventOrError.value
        ).replace(/\n/g, " / ")}`
      );

      return ResponseErrorValidation(
        "Unable to decode CreatedMessageEvent",
        readableReport(createdMessageEventOrError.value)
      );
    }

    // queue the message to the created messages queue by setting
    // the message to the output binding of this function
    // tslint:disable-next-line:no-object-mutation
    // context.bindings.createdMessage = createdMessageEventOrError.value;
    const dfClient = df.getClient(context);
    const dfInstanceId = await dfClient.startNew(
      "CreatedMessageOrchestrator",
      undefined,
      createdMessageEventOrError.value
    );
    winston.debug(
      `Started orchestration with ID='${dfInstanceId}' for message with ID='${newMessageWithoutContent.id}'.`
    );

    //
    // generate appinsights event
    //

    // track the event that a message has been created
    appInsightsClient.trackEvent({
      measurements: {
        duration: diffInMilliseconds(startRequestTime)
      },
      name: appInsightsEventName,
      properties: {
        ...appInsightsEventProps,
        success: "true"
      }
    });

    //
    // respond to request
    //

    // redirect the client to the message resource
    return ResponseSuccessRedirectToResource(
      newMessageWithoutContent,
      `/api/v1/messages/${fiscalCode}/${newMessageWithoutContent.id}`,
      { id: newMessageWithoutContent.id }
    );
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
