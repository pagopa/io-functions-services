import { Notification } from "@pagopa/io-backend-notifications-sdk/Notification";
import { SuccessResponse } from "@pagopa/io-backend-notifications-sdk/SuccessResponse";
import { notifyDefaultDecoder } from "@pagopa/io-backend-notifications-sdk/requestTypes";
import { HttpsUrl } from "@pagopa/io-functions-commons/dist/generated/definitions/HttpsUrl";
import {
  ApiHeaderJson,
  TypeofApiCall,
  createFetchRequestForApi
} from "@pagopa/ts-commons/lib/requests";
import * as r from "@pagopa/ts-commons/lib/requests";
import { ProblemJson } from "@pagopa/ts-commons/lib/responses";

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
      body: (params) => JSON.stringify(params.notification),
      headers: ApiHeaderJson,
      method: "post",
      query: () => ({}),
      response_decoder: notifyDefaultDecoder(),
      url: (params) => `${params.webhookEndpoint}`
    } as WebhookNotifyT,
    { fetchApi }
  );
