import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";
import * as IO from "fp-ts/IO";
import * as t from "io-ts";
import { pipe, flow } from "fp-ts/lib/function";
import { wrapWithKind } from "@pagopa/io-functions-commons/dist/src/utils/types";

const BaseError = t.interface({ message: t.string }, "BaseError");

export type NotFoundError = t.TypeOf<typeof NotFoundError>;
export const NotFoundError = wrapWithKind(BaseError, "NotFoundError");
export const notFoundError = (message: string): NotFoundError => ({
  kind: "NotFoundError",
  message
});

export type InternalError = t.TypeOf<typeof InternalError>;
export const InternalError = wrapWithKind(BaseError, "InternalError");
export const internalError = (message: string): InternalError => ({
  kind: "InternalError",
  message
});

export type LegalMessageMapError = t.TypeOf<typeof LegalMessageMapError>;
export const LegalMessageMapError = t.union(
  [NotFoundError, InternalError],
  "LegalMessageMapError"
);

export interface ILegalMessageMap {
  readonly serviceId: string;
}

export interface ILegalMessageMapModel {
  readonly findLastVersionByModelId: (
    email: string
  ) => TE.TaskEither<LegalMessageMapError, O.Option<ILegalMessageMap>>;
}

const FIXED_PEC_MAP: Record<string, ILegalMessageMap> = {
  "test@legal.it": { serviceId: "dummy-service" }
};

/**
 * @category: model
 * @since: 1.0.0
 */
export type LegalMessageMapper = IO.IO<ILegalMessageMapModel>;

export const DummyLegalMessageMapModel: ILegalMessageMapModel = {
  findLastVersionByModelId: email =>
    pipe(O.fromNullable(FIXED_PEC_MAP[email]), TE.right)
};

/**
 * @param model
 * @category: constructor
 * @since: 1.0.0
 */
export const of = (
  model: ILegalMessageMapModel
): LegalMessageMapper => (): ILegalMessageMapModel => model;

export const mapPecWithService: (
  fa: LegalMessageMapper
) => (
  email: string
) => TE.TaskEither<LegalMessageMapError, ILegalMessageMap> = fa =>
  flow(
    email => fa().findLastVersionByModelId(email),
    TE.chain(
      TE.fromOption(() => notFoundError("No service found for input email"))
    )
  );
