import { agent } from "italia-ts-commons";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "italia-ts-commons/lib/fetch";
import { Millisecond } from "italia-ts-commons/lib/units";
import nodeFetch from "node-fetch";
import { createClient } from "../generated/api-admin/client";

import { getConfigOrThrow } from "../utils/config";

const config = getConfigOrThrow();

export const adminBaseUrl = config.IO_FUNCTIONS_ADMIN_BASE_URL;
export const adminToken = config.IO_FUNCTIONS_ADMIN_API_TOKEN;

// 5 seconds timeout by default
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

// Must be an https endpoint so we use an https agent
const abortableFetch = AbortableFetch(agent.getHttpFetch(process.env));
const fetchWithTimeout = toFetch(
  setFetchTimeout(DEFAULT_REQUEST_TIMEOUT_MS as Millisecond, abortableFetch)
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchApi: typeof fetchWithTimeout = (nodeFetch as any) as typeof fetchWithTimeout;

export const apiClient = createClient<"SubscriptionKey">({
  baseUrl: adminBaseUrl,
  fetchApi,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/naming-convention
  withDefaults: op => params => op({ SubscriptionKey: adminToken, ...params })
});

export type APIClient = typeof apiClient;
