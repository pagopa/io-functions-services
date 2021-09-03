import { wrapRequestHandler } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import * as express from "express";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";

import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";

import * as packageJson from "../package.json";
import { checkApplicationHealth, HealthCheck } from "../utils/healthcheck";

interface IInfo {
  readonly name: string;
  readonly version: string;
}

type InfoHandler = () => Promise<
  IResponseSuccessJson<IInfo> | IResponseErrorInternal
>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function InfoHandler(healthCheck: HealthCheck): InfoHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return () =>
    pipe(
      healthCheck,
      TE.mapLeft(problems => ResponseErrorInternal(problems.join("\n\n"))),
      TE.map(_ =>
        ResponseSuccessJson({
          name: packageJson.name,
          version: packageJson.version
        })
      ),
      TE.toUnion
    )();
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function Info(): express.RequestHandler {
  const handler = InfoHandler(checkApplicationHealth());

  return wrapRequestHandler(handler);
}
