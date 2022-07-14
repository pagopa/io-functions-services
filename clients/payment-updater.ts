import { agent } from "@pagopa/ts-commons";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "@pagopa/ts-commons/lib/fetch";
import { Millisecond } from "@pagopa/ts-commons/lib/units";
import nodeFetch from "node-fetch";
import { createClient } from "../generated/payment-updater/client";

import { getConfigOrThrow } from "../utils/config";

const config = getConfigOrThrow();

export const apimBaseUrl = config.APIM_BASE_URL;
export const apimSubscriptionKey = config.APIM_SUBSCRIPTION_KEY;

// 5 seconds timeout by default
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

// Must be an https endpoint so we use an https agent
const abortableFetch = AbortableFetch(agent.getHttpsFetch(process.env));
const fetchWithTimeout = toFetch(
  setFetchTimeout(DEFAULT_REQUEST_TIMEOUT_MS as Millisecond, abortableFetch)
);
const fetchApi: typeof fetchWithTimeout = (nodeFetch as unknown) as typeof fetchWithTimeout;

export const paymentUpdaterClient = createClient<"SubscriptionKey">({
  baseUrl: apimBaseUrl,
  fetchApi,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  withDefaults: op => params =>
    op({ SubscriptionKey: apimSubscriptionKey, ...params })
});

export type PaymentUpdaterClient = typeof paymentUpdaterClient;
