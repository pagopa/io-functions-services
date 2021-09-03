import { Context } from "@azure/functions";
import { Errors } from "io-ts";
import { errorsToReadableMessages } from "@pagopa/ts-commons/lib/reporters";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getLogger = (
  context: Context,
  logPrefix: string,
  name: string
) => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  logErrors: (errs: Errors) =>
    context.log.error(
      `${logPrefix}|${name}|ERROR=${errorsToReadableMessages(errs)}`
    ),
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  logUnknown: (errs: unknown) =>
    context.log.error(
      `${logPrefix}|${name}|UNKNOWN_ERROR=${JSON.stringify(errs)}`
    )
});

export type ILogger = ReturnType<typeof getLogger>;
