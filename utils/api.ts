import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as t from "io-ts";
import { IResponseType } from "@pagopa/ts-commons/lib/requests";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";
import { ILogger } from "./logging";
import {
  ErrorResponses,
  toDefaultResponseErrorInternal,
  toErrorServerResponse
} from "./responses";

export const withApiRequestWrapper = <T>(
  logger: ILogger,
  apiCallWithParams: () => Promise<
    t.Validation<IResponseType<number, T, never>>
  >,
  successStatusCode: 200 | 201 | 202 = 200
): TaskEither<ErrorResponses, T> =>
  pipe(
    TE.tryCatch(
      () => apiCallWithParams(),
      errs => {
        logger.logUnknown(errs);
        return toDefaultResponseErrorInternal(errs);
      }
    ),
    TE.fold(
      err => TE.left(err),
      errorOrResponse =>
        pipe(
          errorOrResponse,
          E.fold(
            errs => {
              logger.logErrors(errs);
              return TE.left(toDefaultResponseErrorInternal(errs));
            },
            responseType =>
              responseType.status !== successStatusCode
                ? TE.left(toErrorServerResponse(responseType))
                : TE.of(responseType.value)
          )
        )
    )
  );
