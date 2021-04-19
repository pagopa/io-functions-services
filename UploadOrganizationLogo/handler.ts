import * as express from "express";

import {
  ClientIp,
  ClientIpMiddleware
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";

import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";

import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import {
  AzureUserAttributesMiddleware,
  IAzureUserAttributes
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorTooManyRequests,
  IResponseSuccessAccepted,
  ResponseSuccessAccepted
} from "italia-ts-commons/lib/responses";
import { OrganizationFiscalCode } from "italia-ts-commons/lib/strings";

import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "@pagopa/io-functions-commons/dist/src/utils/source_ip_check";

import { Context } from "@azure/functions";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { identity } from "fp-ts/lib/function";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { APIClient } from "../clients/admin";
import { Logo } from "../generated/api-admin/Logo";
import { withApiRequestWrapper } from "../utils/api";
import { getLogger, ILogger } from "../utils/logging";
import {
  ErrorResponses,
  IResponseErrorUnauthorized,
  toDefaultResponseErrorInternal
} from "../utils/responses";

type ResponseTypes =
  | IResponseSuccessAccepted
  | IResponseErrorUnauthorized
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorTooManyRequests
  | IResponseErrorInternal;

const logPrefix = "UploadOrganizationLogoHandler";

/**
 * Type of a UploadOrganizationLogoHandler handler.
 *
 * UploadOrganizationLogo expects an organization fiscal code and a logo as input
 * and returns informations about upload outcome
 */
type IUploadOrganizationLogoHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  attrs: IAzureUserAttributes,
  organizationFiscalCode: OrganizationFiscalCode,
  logoPayload: Logo
) => Promise<ResponseTypes>;

const uploadOrganizationLogoTask = (
  logger: ILogger,
  apiClient: APIClient,
  organizationFiscalCode: OrganizationFiscalCode,
  logo: Logo
): TaskEither<ErrorResponses, IResponseSuccessAccepted> =>
  withApiRequestWrapper(
    logger,
    () =>
      apiClient.uploadOrganizationLogo({
        body: logo,
        organization_fiscal_code: organizationFiscalCode
      }),
    201
  ).map(_ => ResponseSuccessAccepted());

/**
 * Handles requests for upload an organization logo.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UploadOrganizationLogoHandler(
  apiClient: APIClient
): IUploadOrganizationLogoHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, max-params
  return (_, __, ___, ____, organizationFiscalCode, logoPayload) =>
    uploadOrganizationLogoTask(
      getLogger(_, logPrefix, "UploadOrganizationLogo"),
      apiClient,
      organizationFiscalCode,
      logoPayload
    )
      .mapLeft(errs =>
        // Not found is never returned by uploadOrganizationLogo but, due to request wrapping return type, we have to wrap it
        errs.kind !== "IResponseErrorNotFound"
          ? errs
          : toDefaultResponseErrorInternal(errs)
      )
      .fold<ResponseTypes>(identity, identity)
      .run();
}

/**
 * Wraps a UploadOrganizationLogo handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UploadOrganizationLogo(
  serviceModel: ServiceModel,
  client: APIClient
): express.RequestHandler {
  const handler = UploadOrganizationLogoHandler(client);
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    ClientIpMiddleware,
    AzureUserAttributesMiddleware(serviceModel),
    RequiredParamMiddleware("organization_fiscal_code", OrganizationFiscalCode),
    RequiredBodyPayloadMiddleware(Logo)
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
