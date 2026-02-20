import { InvocationContext } from "@azure/functions";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { errorsToReadableMessages } from "@pagopa/ts-commons/lib/reporters";
import { Errors } from "io-ts";

export const getLogger = (
  context: InvocationContext,
  logPrefix: string,
  name: string
) => ({
  logCosmosErrors: (errs: CosmosErrors): void =>
    context.error(
      `${logPrefix}|${name}|COSMOS_ERROR|ERROR_DETAILS=${errs.kind === "COSMOS_EMPTY_RESPONSE" ||
        errs.kind === "COSMOS_CONFLICT_RESPONSE"
        ? errs.kind
        : errs.kind === "COSMOS_DECODING_ERROR"
          ? errorsToReadableMessages(errs.error).join("/")
          : JSON.stringify(errs.error)
      }`
    ),
  logErrors: (errs: Errors): void =>
    context.error(
      `${logPrefix}|${name}|ERROR=${errorsToReadableMessages(errs)}`
    ),
  logUnknown: (errs: unknown): void =>
    context.error(
      `${logPrefix}|${name}|UNKNOWN_ERROR=${JSON.stringify(errs)}`
    )
});

export type ILogger = ReturnType<typeof getLogger>;
