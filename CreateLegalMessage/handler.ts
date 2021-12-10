/*
 * Implements the API handlers for the Legal Message resource.
 */

import * as express from "express";
import * as winston from "winston";

import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/TaskEither";
import * as E from "fp-ts/Either";

import { withRequestMiddlewares } from "@pagopa/ts-commons/lib/request_middleware";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  AzureApiAuthMiddleware,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import {
  IRequestMiddleware,
  RequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import { Context } from "@azure/functions";
import { IAzureApiAuthorization } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { EmailString } from "@pagopa/ts-commons/lib/strings";
import { ImpersonatedService } from "../generated/api-admin/ImpersonatedService";
import { ErrorResponses } from "../utils/responses";
import { withApiRequestWrapper } from "../utils/api";
import { APIClient } from "../clients/admin";
import { ILogger, getLogger } from "../utils/logging";
import { ILegalMessageMapModel, notFoundError } from "../utils/legal-message";

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

type ICreateServiceHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  rawRequest: express.Request,
  legalmail: EmailString
) => Promise<ErrorResponses | IResponseSuccessJson<ImpersonatedService>>;

/**
 * Handles requests for imporsonate service by a input serviceId.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function ImpersonateServiceHandler(
  adminClient: APIClient,
  lmMapper: ILegalMessageMapModel
): ICreateServiceHandler {
  return (
    context,
    _auth,
    rawRequest,
    legalmail
  ): ReturnType<ICreateServiceHandler> => {
    const bbb = pipe(
      legalmail,
      lmMapper.findLastVersionByModelId,
      TE.chain(
        TE.fromOption(() =>
          notFoundError("Can not found a service with the input legal mail")
        )
      ),
      TE.map(lmMap => lmMap.serviceId),
      TE.mapLeft(e =>
        e.kind === "NotFoundError"
          ? ResponseErrorNotFound("Not Found", e.message)
          : ResponseErrorInternal(e.message)
      ),
      TE.chainW(serviceId =>
        getImpersonatedService(
          getLogger(context, logPrefix, "ImpersonateService"),
          adminClient,
          serviceId
        )
      ),
      TE.map(impersonatedService => {
        // eslint-disable-next-line functional/immutable-data
        rawRequest.headers["x-user-groups"] =
          impersonatedService.user_groups || "";
        // FIXME: const HEADER_USER_EMAIL = "x-user-email";
        //        const HEADER_USER_SUBSCRIPTION_KEY = "x-subscription-id";
        return impersonatedService;
      }),
      TE.map(ResponseSuccessJson),
      TE.toUnion
    );

    return bbb();
  };
}

export const RawRequestMiddleware = (): IRequestMiddleware<
  never,
  express.Request
> => (request): Promise<E.Either<never, express.Request>> =>
  TE.right(request)();

export const wrapRequestHandlerWithoutResponseApply = <R>(
  handler: RequestHandler<R>
): express.RequestHandler => (request, response, _): Promise<void> =>
  handler(request).then(
    r => {
      winston.log(
        "debug",
        `wrapRequestHandler|SUCCESS|${request.url}|${r.kind}`
      );
    },
    e => {
      winston.log("debug", `wrapRequestHandler|ERROR|${request.url}|${e}`);
      ResponseErrorInternal(e).apply(response);
    }
  );

/**
 * Wraps a ImpersonateService handler inside an Express request handler.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const ImpersonateService = (
  adminClient: APIClient,
  lmMapper: ILegalMessageMapModel
) => {
  const handler = ImpersonateServiceHandler(adminClient, lmMapper);
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiMessageWriteWithLegal])), // FIXME create new permission for PEC-SERVER only
    RawRequestMiddleware(),
    RequiredParamMiddleware("legalmail", EmailString)
  );

  return middlewaresWrap(handler);
};
