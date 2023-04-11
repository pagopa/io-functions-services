import { HttpsUrl } from "@pagopa/io-functions-commons/dist/generated/definitions/HttpsUrl";
import {
  ApiHeaderJson,
  createFetchRequestForApi,
  TypeofApiCall
} from "@pagopa/ts-commons/lib/requests";
import * as r from "@pagopa/ts-commons/lib/requests";
import { ProblemJson } from "@pagopa/ts-commons/lib/responses";
import { Notification } from "@pagopa/io-backend-notifications-sdk/Notification";
import { notifyDefaultDecoder } from "@pagopa/io-backend-notifications-sdk/requestTypes";
import { SuccessResponse } from "@pagopa/io-backend-notifications-sdk/SuccessResponse";

export type WebhookNotifyT = r.IPostApiRequestType<
  { readonly notification: Notification; readonly webhookEndpoint: HttpsUrl },
  "Content-Type",
  never,
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
