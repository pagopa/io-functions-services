import { Context } from "@azure/functions";
import { Errors } from "io-ts";
import { errorsToReadableMessages } from "italia-ts-commons/lib/reporters";

export const getLogger = (
  context: Context,
  logPrefix: string,
  name: string
) => {
  return {
    logErrors: (errs: Errors) =>
      context.log.error(
        `${logPrefix}|${name}|ERROR=${errorsToReadableMessages(errs)}`
      ),
    logUnknown: (errs: unknown) =>
      context.log.error(
        `${logPrefix}|${name}|UNKNOWN_ERROR=${JSON.stringify(errs)}`
      )
  };
};

export type ILogger = ReturnType<typeof getLogger>;
