import { UserGroup } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import {
  TypeofApiCall,
  createFetchRequestForApi
} from "@pagopa/ts-commons/lib/requests";
import * as r from "@pagopa/ts-commons/lib/requests";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorNotFound,
  IResponseSuccessNoContent,
  ProblemJson
} from "@pagopa/ts-commons/lib/responses";

import { notifyDefaultDecoder } from "../generated/notify/requestTypes";

export type WebhookNotifyT = r.IPostApiRequestType<
  {
    fiscal_code: string;
    notification_type: string;
    message_id: string;
    webhookEndpoint: string;
  },
  "x-user-groups",
  never,
  | r.IResponseType<204, IResponseSuccessNoContent>
  | r.IResponseType<400, ProblemJson>
  | r.IResponseType<401, undefined>
  | r.IResponseType<403, IResponseErrorForbiddenNotAuthorized>
  | r.IResponseType<404, IResponseErrorNotFound>
  | r.IResponseType<500, ProblemJson>
>;

export const getNotifyClient = (
  fetchApi: typeof fetch
): TypeofApiCall<WebhookNotifyT> =>
  createFetchRequestForApi(
    {
      body: (params) => JSON.stringify(params),
      headers: (): r.RequestHeaders<"x-user-groups"> => ({
        "x-user-groups": UserGroup.ApiNewMessageNotify
      }),
      method: "post",
      query: () => ({}),
      response_decoder: notifyDefaultDecoder(),
      url: (params) => `${params.webhookEndpoint}`
    } as WebhookNotifyT,
    { fetchApi }
  );
