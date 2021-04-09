import {
  fromEither,
  fromLeft,
  TaskEither,
  taskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { IResponseType } from "italia-ts-commons/lib/requests";
import { ILogger } from "./logging";
import {
  ErrorResponses,
  toDefaultResponseErrorInternal,
  toErrorServerResponse
} from "./responses";

/**
 * Wrap the input API call into a TaskEither, returning a response type T (if both API call and response parse complete successfully) or an ErrorResponses.
 * TYPE HAZARD: this function support only a single successful response type T: if the call response status code match the input successStatusCode the function returns an object <T>, otherwise the api response must be undefined and the function returns an object type ErrorResponses.
 * @param logger - the Logger instance used to log errors
 * @param apiCallWithParams - the API call as a promise
 * @param successStatusCode - the successful status code used to accept the response as valid and decode it into an object T
 * @returns a TaskEither wrapping the API call
 */
export const withApiRequestWrapper = <T>(
  logger: ILogger,
  apiCallWithParams: () => Promise<
    t.Validation<IResponseType<number, T | undefined, never>>
  >,
  successStatusCode: 200 | 201 | 202 = 200
): TaskEither<ErrorResponses, T> =>
  tryCatch(
    () => apiCallWithParams(),
    errs => {
      logger.logUnknown(errs);
      return toDefaultResponseErrorInternal(errs);
    }
  )
    .map(fromEither)
    .foldTaskEither(
      apiCallError => fromLeft<ErrorResponses, T>(apiCallError),
      apiCallResponse =>
        apiCallResponse.foldTaskEither<ErrorResponses, T>(
          parseResponseError => {
            logger.logErrors(parseResponseError);
            return fromLeft<ErrorResponses, T>(
              toDefaultResponseErrorInternal(parseResponseError)
            );
          },
          response =>
            response.status === successStatusCode &&
            response.value !== undefined
              ? taskEither.of(response.value)
              : fromLeft<ErrorResponses, T>(toErrorServerResponse(response))
        )
    );
