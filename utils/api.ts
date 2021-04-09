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
 * Wrap the input API call into a TaskEither, returning a response type T (if both the response status code match the input successStatusCode and the response decode successfully) or an ErrorResponses.
 * TYPE HAZARD: this function support only a single successful response type T: if the api response body value is not undefined will be decoded in a T object, otherwise returns an ErrorResponses.
 * @see withEmptyApiRequestWrapper
 * @param logger - the Logger instance used to log errors
 * @param apiCallWithParams - the API call as a promise
 * @param successStatusCode - the successful status code used to accept the response as valid and decode it into an object T
 * @returns a TaskEither wrapping the API call
 */
export const withEmbodimentApiRequestWrapper = <T>(
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

/**
 * Wrap the input API call into a TaskEither, returning an empty response (if the repsonse status code match the input successStatusCode) or an ErrorResponses.
 * @param logger - the Logger instance used to log errors
 * @param apiCallWithParams - the API call as a promise
 * @param successStatusCode - the successful status code used to accept the response as valid and decode it into an object T
 * @returns a TaskEither wrapping the API call
 */
export const withEmptyApiRequestWrapper = <T>(
  logger: ILogger,
  apiCallWithParams: () => Promise<
    t.Validation<IResponseType<number, T | undefined, never>>
  >,
  successStatusCode: 200 | 201 | 202 = 200
): TaskEither<ErrorResponses, undefined> =>
  tryCatch(
    () => apiCallWithParams(),
    errs => {
      logger.logUnknown(errs);
      return toDefaultResponseErrorInternal(errs);
    }
  )
    .map(fromEither)
    .foldTaskEither(
      apiCallError => fromLeft<ErrorResponses, undefined>(apiCallError),
      apiCallResponse =>
        apiCallResponse.foldTaskEither<ErrorResponses, undefined>(
          parseResponseError => {
            logger.logErrors(parseResponseError);
            return fromLeft<ErrorResponses, undefined>(
              toDefaultResponseErrorInternal(parseResponseError)
            );
          },
          response =>
            response.status === successStatusCode
              ? taskEither.of(undefined)
              : fromLeft<ErrorResponses, undefined>(
                  toErrorServerResponse(response)
                )
        )
    );
