import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";
import * as IO from "fp-ts/IO";
import { pipe, flow } from "fp-ts/lib/function";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  ResponseErrorNotFound
} from "@pagopa/ts-commons/lib/responses";
import { FIXED_PEC_MAP } from "./mvl-service-mapper";

export type LegalMessageMapError =
  | IResponseErrorInternal
  | IResponseErrorNotFound;

export interface ILegalMessageMap {
  readonly serviceId: string;
}
export interface ILegalMessageMapModel {
  readonly findLastVersionByModelId: (
    email: string
  ) => TE.TaskEither<LegalMessageMapError, O.Option<ILegalMessageMap>>;
}

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
      TE.fromOption(() =>
        ResponseErrorNotFound("Not Found", "No service found for input email")
      )
    )
  );
