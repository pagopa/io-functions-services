import * as express from "express";
import { wrapRequestHandler } from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import * as packageJson from "../package.json";

interface IInfo {
  version: string;
}

type InfoHandler = () => Promise<IResponseSuccessJson<IInfo>>;

export function InfoHandler(): InfoHandler {
  return async () => {
    return ResponseSuccessJson({
      version: packageJson.version
    });
  };
}

export function Info(): express.RequestHandler {
  const handler = InfoHandler();

  return wrapRequestHandler(handler);
}
