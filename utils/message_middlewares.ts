import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  AzureApiAuthMiddleware,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { AzureUserAttributesMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import { ClientIpMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { OptionalFiscalCodeMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/fiscalcode";
import {
  IResponse,
  IResponseErrorForbiddenAnonymousUser,
  IResponseErrorForbiddenNoAuthorizationGroups,
  IResponseErrorForbiddenNotAuthorizedForDefaultAddresses,
  IResponseErrorForbiddenNotAuthorizedForProduction,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorTooManyRequests,
  IResponseErrorValidation,
  ResponseErrorFromValidationErrors
} from "@pagopa/ts-commons/lib/responses";
import { IResponseErrorQuery } from "@pagopa/io-functions-commons/dist/src/utils/response";
import { IRequestMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import { ApiNewMessageWithDefaults } from "../CreateMessage/types";

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
 * This is a Set of Common middlewares that should be applied in all case while
 * sending a message through IO Platform. Every edit to this list of middlewares
 * applies also to Legal Message endpoint
 *
 * @param serviceModel
 * @returns an Array of Common middlewares applied to Send a message through IO App
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const commonCreateMessageMiddlewares = (serviceModel: ServiceModel) =>
  [
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
    OptionalFiscalCodeMiddleware
  ] as const;

/**
 * A custom type that infers IResponse type and returns cast
 * to the correct handler ResponseType
 */
export type IResponseType<T> = T extends IResponse<infer S>
  ? S extends "IResponseErrorInternal"
    ? IResponseErrorInternal
    : S extends "IResponseErrorValidation"
    ? IResponseErrorValidation
    : S extends "IResponseErrorForbiddenNotAuthorizedForProduction"
    ? IResponseErrorForbiddenNotAuthorizedForProduction
    : S extends "IResponseErrorNotFound"
    ? IResponseErrorNotFound
    : S extends "IResponseErrorForbiddenNotAuthorizedForDefaultAddresses"
    ? IResponseErrorForbiddenNotAuthorizedForDefaultAddresses
    : S extends "IResponseErrorForbiddenNoAuthorizationGroups"
    ? IResponseErrorForbiddenNoAuthorizationGroups
    : S extends "IResponseErrorForbiddenAnonymousUser"
    ? IResponseErrorForbiddenAnonymousUser
    : S extends "IResponseErrorQuery"
    ? IResponseErrorQuery
    : S extends "IResponseErrorTooManyRequests"
    ? IResponseErrorTooManyRequests
    : never
  : never;

export const mapMiddlewareResponse = <T>(res: T): IResponseType<T> =>
  res as IResponseType<typeof res>;
