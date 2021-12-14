/*
 * Implements the API handlers for the Legal Message resource.
 */

import * as express from "express";

import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/TaskEither";
import * as E from "fp-ts/Either";

import { withRequestMiddlewares } from "@pagopa/ts-commons/lib/request_middleware";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  AzureApiAuthMiddleware,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IRequestMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorNotFound,
  IResponseErrorTooManyRequests,
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
import { ImpersonatedService } from "../generated/api-admin/ImpersonatedService";
import { ErrorResponses, IResponseErrorUnauthorized } from "../utils/responses";
import { withApiRequestWrapper } from "../utils/api";
import { APIClient } from "../clients/admin";
import { ILogger, getLogger } from "../utils/logging";
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

const logPrefix = "CreateLegalMessageHandler";

const getImpersonatedService = (
  logger: ILogger,
  adminClient: APIClient,
  serviceId: string
): TE.TaskEither<ErrorResponses, ImpersonatedService> =>
  withApiRequestWrapper(
    logger,
    () =>
      adminClient.getImpersonatedService({
        serviceId
      }),
    200
  );

type ICreateLegalMessageHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  rawRequest: express.Request,
  legalmail: EmailString
) => Promise<
  | IResponseErrorNotFound
  | IResponseErrorUnauthorized
  | IResponseErrorTooManyRequests
  | CreateMessageHandlerResponse
>;

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
    rawRequest,
    legalmail
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
    ...([
      ContextMiddleware(),
      AzureApiAuthMiddleware(new Set([UserGroup.ApiMessageWriteWithLegal])), // FIXME create new permission for PEC-SERVER only
      RawRequestMiddleware(),
      RequiredParamMiddleware("legalmail", EmailString)
    ] as const)
  );

  return middlewaresWrap(handler);
};
