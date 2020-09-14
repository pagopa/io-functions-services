import { Context } from "@azure/functions";
import { Errors } from "io-ts";
import * as t from "io-ts";
import { errorsToReadableMessages } from "italia-ts-commons/lib/reporters";

const ValidationErrors = t.array(
  t.interface({
    context: t.any,
    message: t.string,
    value: t.unknown
  })
);

type ValidationErrors = t.TypeOf<typeof ValidationErrors>;

export const defaultErrsLog = (
  context: Context,
  logPrefix: string,
  name: string
) => (errs: unknown | Errors) =>
  ValidationErrors.decode(errs).fold(
    () => context.log(`${logPrefix}|${name}|ERROR=${JSON.stringify(errs)}`),
    _ =>
      context.log(`${logPrefix}|${name}|ERROR=${errorsToReadableMessages(_)}`)
  );

export type ErrorsLogType = (errs: unknown | Errors) => void;
