/*
 * Implements the API handlers for the Message resource.
 */
import { Context } from "@azure/functions";

import * as express from "express";
import * as df from "durable-functions";

import * as E from "fp-ts/lib/Either";
import { Lazy, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import * as T from "fp-ts/lib/Task";

import * as t from "io-ts";

import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { EUCovidCert } from "@pagopa/io-functions-commons/dist/generated/definitions/EUCovidCert";
import { CreatedMessageEvent } from "@pagopa/io-functions-commons/dist/src/models/created_message_event";
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
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import {
  AzureUserAttributesMiddleware,
  IAzureUserAttributes
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import {
  ClientIp,
  ClientIpMiddleware
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { OptionalFiscalCodeMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/fiscalcode";
import {
  IRequestMiddleware,
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
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
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
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { PromiseType } from "@pagopa/ts-commons/lib/types";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { Option } from "fp-ts/lib/Option";
import { Either } from "fp-ts/lib/Either";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { PaymentDataWithRequiredPayee } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentDataWithRequiredPayee";
import { NewMessage as ApiNewMessage } from "@pagopa/io-functions-commons/dist/generated/definitions/NewMessage";
import { ApiNewMessageWithContentOf, ApiNewMessageWithDefaults } from "./types";

/**
 * A request middleware that validates the Message payload.
 */
export const MessagePayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  ApiNewMessageWithDefaults
> = request =>
  pipe(
    request.body,
    ApiNewMessageWithDefaults.decode,
    TE.fromEither,
    TE.mapLeft(ResponseErrorFromValidationErrors(ApiNewMessageWithDefaults))
  )();

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
      return E.left(ResponseErrorForbiddenNotAuthorizedForRecipient);
    }
  } else if (!authGroups.has(UserGroup.ApiMessageWrite)) {
    // the user is doing a production call but he's not enabled
    return E.left(ResponseErrorForbiddenNotAuthorizedForProduction);
  }

  return E.right(true);
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
    return E.left(ResponseErrorForbiddenNotAuthorizedForDefaultAddresses);
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
 * Forks the durable function orchestrator that will further process the message
 * asynchronously (storing the content into a blob, delivering notifications).
 */
export const forkOrchestrator = (
  getDfClient: Lazy<ReturnType<typeof df.getClient>>,
  messageContent: ApiNewMessageWithDefaults["content"],
  service: IAzureUserAttributes["service"],
  newMessageWithoutContent: NewMessageWithoutContent,
  serviceUserEmail: IAzureUserAttributes["email"]
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
      requireSecureChannels: service.requireSecureChannels,
      serviceName: service.serviceName,
      serviceUserEmail
    },
    serviceVersion: service.version
  });

  if (E.isLeft(createdMessageEventOrError)) {
    return TE.left(
      ResponseErrorValidation(
        "Unable to decode CreatedMessageEvent",
        readableReport(createdMessageEventOrError.left)
      )
    );
  }

  // queue the message to the created messages queue by setting
  // the message to the output binding of this function
  // eslint-disable-next-line functional/immutable-data
  // eslint-disable-next-line extra-rules/no-commented-out-code
  // context.bindings.createdMessage = createdMessageEventOrError.value;
  const dfClient = getDfClient();
  return TE.tryCatch(
    () =>
      dfClient.startNew(
        "CreatedMessageOrchestrator",
        undefined,
        createdMessageEventOrError.right
      ),
    e => ResponseErrorInternal(String(e))
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
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function CreateMessageHandler(
  telemetryClient: ReturnType<typeof initAppInsights>,
  messageModel: MessageModel,
  generateObjectId: ObjectIdGenerator,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: ReadonlyArray<ServiceId>
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
      isSuccess: boolean
    ): void =>
      telemetryClient.trackEvent({
        name: "api.messages.create",
        properties: {
          error: isSuccess ? undefined : r.kind,
          hasDefaultEmail: Boolean(
            // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
            messagePayload.default_addresses &&
              messagePayload.default_addresses.email
          ).toString(),
          messageId,
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
        // check whether the client can provide default addresses
        TE.fromEither(canDefaultAddresses(messagePayload))
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
          serviceId
        )
      ),
      TE.chain(newMessageWithoutContent =>
        // fork the durable function orchestrator that will complete
        // processing the message asynchrnously
        pipe(
          forkOrchestrator(
            () => df.getClient(context),
            messagePayload.content,
            service,
            newMessageWithoutContent,
            serviceUserEmail
          ),
          TE.map(() => redirectToNewMessage(newMessageWithoutContent))
        )
      ),
      // fold failure responses (left) and success responses (right) to a
      // single response
      TE.toUnion,
      T.map(r => {
        // before returning the response to the client we log the result
        const isSuccess = r.kind === "IResponseSuccessRedirectToResource";
        trackResponse(r, isSuccess);
        logResponse(r, isSuccess);
        return r;
      })
    )();
  };
}

/**
 * Wraps a CreateMessage handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function CreateMessage(
  telemetryClient: ReturnType<typeof initAppInsights>,
  serviceModel: ServiceModel,
  messageModel: MessageModel,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: ReadonlyArray<ServiceId>
): express.RequestHandler {
  const handler = CreateMessageHandler(
    telemetryClient,
    messageModel,
    ulidGenerator,
    disableIncompleteServices,
    incompleteServiceWhitelist
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
    // extracts the create message payload from the request body
    MessagePayloadMiddleware,
    // extracts the optional fiscal code from the request params
    OptionalFiscalCodeMiddleware,
    // Ensures only users in ApiMessageWriteEUCovidCert group can send messages with EUCovidCert payload
    AzureAllowBodyPayloadMiddleware(
      ApiNewMessageWithContentOf(t.interface({ eu_covid_cert: EUCovidCert })),
      new Set([UserGroup.ApiMessageWriteEUCovidCert])
    ),
    // Ensures only users in ApiMessageWriteWithPayee group can send payment messages with payee payload
    AzureAllowBodyPayloadMiddleware(
      ApiNewMessageWithContentOf(
        t.interface({ payment_data: PaymentDataWithRequiredPayee })
      ),
      new Set([UserGroup.ApiMessageWriteWithPayee])
    )
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
