import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { errorsToReadableMessages } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import * as t from "io-ts";

export const BaseError = t.type({
  detail: NonEmptyString,
  title: NonEmptyString
});

enum ErrorKind {
  NotFound = "NotFound",
  Internal = "Internal"
}

export type NotFoundError = t.TypeOf<typeof NotFoundError>;
export const NotFoundError = t.intersection([
  BaseError,
  t.type({
    kind: t.literal(ErrorKind.NotFound),
    objectName: NonEmptyString
  })
]);

export const toNotFoundError = (
  title: NonEmptyString,
  detail: NonEmptyString,
  objectName: NonEmptyString
): NotFoundError => ({ detail, kind: ErrorKind.NotFound, objectName, title });

export type InternalError = t.TypeOf<typeof InternalError>;
export const InternalError = t.intersection([
  BaseError,
  t.type({
    kind: t.literal(ErrorKind.Internal)
  })
]);

export const toInternalError = (
  title: NonEmptyString,
  detail: NonEmptyString
): InternalError => ({ detail, kind: ErrorKind.Internal, title });

/**
 * All domain errors
 */
export type DomainErrors = t.TypeOf<typeof DomainErrors>;
export const DomainErrors = t.union([InternalError, NotFoundError]);

// -------------------------------------
// utils
// -------------------------------------

export const cosmosErrorsToString = (errs: CosmosErrors): NonEmptyString =>
  pipe(
    errs.kind === "COSMOS_EMPTY_RESPONSE"
      ? "Empty response"
      : errs.kind === "COSMOS_CONFLICT_RESPONSE"
      ? "Conflict response"
      : errs.kind === "COSMOS_DECODING_ERROR"
      ? "Decoding error: " + errorsToReadableMessages(errs.error).join("/")
      : errs.kind === "COSMOS_CONFLICT_RESPONSE"
      ? "Conflict error, a document with the same ID already exist"
      : "Generic error: " + JSON.stringify(errs.error),

    errorString => errorString as NonEmptyString
  );
