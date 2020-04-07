import { HttpsUrl } from "io-functions-commons/dist/generated/definitions/HttpsUrl";
import {
  ApiHeaderJson,
  createFetchRequestForApi,
  TypeofApiCall
} from "italia-ts-commons/lib/requests";
import * as r from "italia-ts-commons/lib/requests";
import { ProblemJson } from "italia-ts-commons/lib/responses";
import { Notification } from "../generated/notifications/Notification";
import { notifyDefaultDecoder } from "../generated/notifications/requestTypes";
import { SuccessResponse } from "../generated/notifications/SuccessResponse";

export type WebhookNotifyT = r.IPostApiRequestType<
  { readonly notification?: Notification; readonly webhookEndpoint: HttpsUrl },
  "Content-Type",
  never,
  // tslint:disable-next-line: max-union-size
  | r.IResponseType<200, SuccessResponse>
  | r.IResponseType<400, ProblemJson>
  | r.IResponseType<401, undefined>
  | r.IResponseType<500, ProblemJson>
>;

export const getNotifyClient = (
  fetchApi: typeof fetch
): TypeofApiCall<WebhookNotifyT> =>
  createFetchRequestForApi(
    {
      body: params => JSON.stringify(params.notification),
      headers: ApiHeaderJson,
      method: "post",
      query: _ => ({}),
      response_decoder: notifyDefaultDecoder(),
      url: params => `${params.webhookEndpoint}`
    } as WebhookNotifyT,
    { fetchApi }
  );
