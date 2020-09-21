import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { agent } from "italia-ts-commons";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "italia-ts-commons/lib/fetch";
import { Millisecond } from "italia-ts-commons/lib/units";
import nodeFetch from "node-fetch";
import { createClient } from "../generated/api-admin/client";

export const adminBaseUrl = getRequiredStringEnv("IO_FUNCTIONS_ADMIN_BASE_URL");
export const adminToken = getRequiredStringEnv("IO_FUNCTIONS_ADMIN_API_TOKEN");

// 5 seconds timeout by default
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

// Must be an https endpoint so we use an https agent
const abortableFetch = AbortableFetch(agent.getHttpFetch(process.env));
const fetchWithTimeout = toFetch(
  setFetchTimeout(DEFAULT_REQUEST_TIMEOUT_MS as Millisecond, abortableFetch)
);
// tslint:disable-next-line: no-any
const fetchApi: typeof fetchWithTimeout = (nodeFetch as any) as typeof fetchWithTimeout;

export const apiClient = createClient<"SubscriptionKey">({
  baseUrl: adminBaseUrl,
  fetchApi,
  withDefaults: op => params => op({ SubscriptionKey: adminToken, ...params })
});

export type APIClient = typeof apiClient;
