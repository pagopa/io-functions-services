import { Context } from "@azure/functions";
import { Errors } from "io-ts";
import { errorsToReadableMessages } from "@pagopa/ts-commons/lib/reporters";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getLogger = (
  context: Context,
  logPrefix: string,
  name: string
) => ({
  logCosmosErrors: (errs: CosmosErrors): void =>
    context.log.error(
      `${logPrefix}|${name}|COSMOS_ERROR|ERROR_DETAILS=${
        errs.kind === "COSMOS_EMPTY_RESPONSE"
          ? errs.kind
          : errs.kind === "COSMOS_DECODING_ERROR"
          ? errorsToReadableMessages(errs.error).join("/")
          : JSON.stringify(errs.error)
      }`
    ),
  logErrors: (errs: Errors): void =>
    context.log.error(
      `${logPrefix}|${name}|ERROR=${errorsToReadableMessages(errs)}`
    ),
  logUnknown: (errs: unknown): void =>
    context.log.error(
      `${logPrefix}|${name}|UNKNOWN_ERROR=${JSON.stringify(errs)}`
    )
});

export type ILogger = ReturnType<typeof getLogger>;
