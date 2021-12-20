/*
 * Implements the API handlers for the Legal Message resource.
 */

import * as express from "express";

import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/TaskEither";
import * as E from "fp-ts/Either";

import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/ts-commons/lib/request_middleware";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  AzureApiAuthMiddleware,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";

import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";

import { IRequestMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorNotFound,
  IResponseErrorTooManyRequests,
  ResponseErrorFromValidationErrors,
  ResponseErrorInternal,
  ResponseErrorNotFound
} from "@pagopa/ts-commons/lib/responses";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import { Context } from "@azure/functions";
import { IAzureApiAuthorization } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { EmailString } from "@pagopa/ts-commons/lib/strings";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
import { initAppInsights } from "@pagopa/ts-commons/lib/appinsights";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { ulidGenerator } from "@pagopa/io-functions-commons/dist/src/utils/strings";
import {
  AzureUserAttributesMiddleware,
  IAzureUserAttributes
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import {
  ClientIp,
  ClientIpMiddleware
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";
import { IResponseErrorUnauthorized } from "../utils/responses";
import { APIClient } from "../clients/admin";
import { getLogger } from "../utils/logging";
import { ILegalMessageMapModel } from "../utils/legal-message";
import {
  CreateMessageHandler,
  CreateMessageHandlerResponse
} from "../CreateMessage/handler";
import {
  commonCreateMessageMiddlewares,
  mapMiddlewareResponse
} from "../utils/message_middlewares";
import { makeUpsertBlobFromObject } from "../CreateMessage/utils";
import { ApiNewMessageWithDefaultsLegalData } from "../CreateMessage/types";
import { getImpersonatedService } from "./impersonate";

const logPrefix = "CreateLegalMessageHandler";

type ICreateLegalMessageHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes,
  rawRequest: express.Request,
  legalmail: EmailString,
  messagePayload: ApiNewMessageWithDefaultsLegalData
) => Promise<
  | IResponseErrorNotFound
  | IResponseErrorUnauthorized
  | IResponseErrorTooManyRequests
  | CreateMessageHandlerResponse
>;

export const LegalMessagePayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  ApiNewMessageWithDefaultsLegalData
> = request =>
  pipe(
    request.body,
    ApiNewMessageWithDefaultsLegalData.decode,
    TE.fromEither,
    TE.mapLeft(
      ResponseErrorFromValidationErrors(ApiNewMessageWithDefaultsLegalData)
    )
  )();

/**
 * Handles requests for imporsonate service by a input serviceId.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function CreateLegalMessageHandler(
  adminClient: APIClient,
  lmMapper: ILegalMessageMapModel,
  serviceModel: ServiceModel,
  createMessageHandler: ReturnType<typeof CreateMessageHandler>
): ICreateLegalMessageHandler {
  return (
    context,
    _auth,
    _attrs,
    _ip,
    rawRequest,
    legalmail,
    _payload
    // eslint-disable-next-line max-params
  ): ReturnType<ICreateLegalMessageHandler> =>
    pipe(
      legalmail,
      lmMapper.findLastVersionByModelId,
      TE.chainW(
        TE.fromOption(() =>
          ResponseErrorNotFound("Not Found", "Service Not Found")
        )
      ),
      TE.map(lmMap => lmMap.serviceId),
      TE.chain(serviceId =>
        getImpersonatedService(
          getLogger(context, logPrefix, "ImpersonateService"),
          adminClient,
          serviceId
        )
      ),
      TE.map(impersonatedService => {
        const replaceHeaders = {
          "x-subscription-id": impersonatedService.service_id,
          "x-user-email": "dummy@email.it", // FIXME
          "x-user-groups": impersonatedService.user_groups
        };
        // eslint-disable-next-line functional/immutable-data
        rawRequest.headers = {
          ...rawRequest.headers,
          ...replaceHeaders
        };
      }),
      TE.chain(() =>
        pipe(
          TE.tryCatch(
            () =>
              withRequestMiddlewares(
                ...commonCreateMessageMiddlewares(serviceModel)
              )(createMessageHandler)(rawRequest),
            _ =>
              ResponseErrorInternal("Error while calling sendMessage handler")
          ),
          // We must remap IResponse<T> where T is a union type of all possible middlewares failures
          // in order to return handler's strict ResponseTypes
          TE.map(mapMiddlewareResponse)
        )
      ),
      TE.toUnion
    )();
}

export const RawRequestMiddleware = (): IRequestMiddleware<
  never,
  express.Request
> => (request): Promise<E.Either<never, express.Request>> =>
  TE.right(request)();

/**
 * Wraps a CreateLegalMessage handler inside an Express request handler.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const CreateLegalMessage = (
  adminClient: APIClient,
  lmMapper: ILegalMessageMapModel,
  telemetryClient: ReturnType<typeof initAppInsights>,
  serviceModel: ServiceModel,
  messageModel: MessageModel,
  saveProcessingMessage: ReturnType<typeof makeUpsertBlobFromObject>,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: ReadonlyArray<ServiceId>
  // eslint-disable-next-line max-params
) => {
  const createMessageHandler = CreateMessageHandler(
    telemetryClient,
    messageModel,
    ulidGenerator,
    saveProcessingMessage,
    disableIncompleteServices,
    incompleteServiceWhitelist
  );
  const handler = CreateLegalMessageHandler(
    adminClient,
    lmMapper,
    serviceModel,
    createMessageHandler
  );
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiMessageWriteWithLegalData])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    RawRequestMiddleware(),
    RequiredParamMiddleware("legalmail", EmailString),
    LegalMessagePayloadMiddleware
  );

  return wrapRequestHandler(
    middlewaresWrap(
      // eslint-disable-next-line max-params
      checkSourceIpForHandler(handler, (_, __, c, u, ___, ____, _____) =>
        ipTuple(c, u)
      )
    )
  );
};
