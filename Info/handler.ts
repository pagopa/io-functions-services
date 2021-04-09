import { wrapRequestHandler } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import * as express from "express";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import * as packageJson from "../package.json";
import { checkApplicationHealth, HealthCheck } from "../utils/healthcheck";

interface IInfo {
  readonly name: string;
  readonly version: string;
}

type InfoHandler = () => Promise<
  IResponseSuccessJson<IInfo> | IResponseErrorInternal
>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention
export function InfoHandler(healthCheck: HealthCheck): InfoHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return () =>
    healthCheck
      .fold<IResponseSuccessJson<IInfo> | IResponseErrorInternal>(
        problems => ResponseErrorInternal(problems.join("\n\n")),
        _ =>
          ResponseSuccessJson({
            name: packageJson.name,
            version: packageJson.version
          })
      )
      .run();
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention
export function Info(): express.RequestHandler {
  const handler = InfoHandler(checkApplicationHealth());

  return wrapRequestHandler(handler);
}
