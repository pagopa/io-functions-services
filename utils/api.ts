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
          parseResponseError =>
            fromLeft<ErrorResponses, T>(
              toDefaultResponseErrorInternal(parseResponseError)
            ),
          response =>
            response.status === successStatusCode &&
            response.value !== undefined
              ? taskEither.of(response.value)
              : fromLeft<ErrorResponses, T>(toErrorServerResponse(response))
        )
    );
