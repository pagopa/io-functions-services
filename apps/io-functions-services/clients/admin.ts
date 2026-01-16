import { createClient } from "@pagopa/io-functions-admin-sdk/client";
import { agent } from "@pagopa/ts-commons";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "@pagopa/ts-commons/lib/fetch";
import { Millisecond } from "@pagopa/ts-commons/lib/units";
import nodeFetch from "node-fetch";

import { getConfigOrThrow } from "../utils/config";

const config = getConfigOrThrow();

export const adminBaseUrl = config.IO_FUNCTIONS_ADMIN_BASE_URL;
export const adminToken = config.IO_FUNCTIONS_ADMIN_API_TOKEN;

// 5 seconds timeout by default
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

// Must be an https endpoint so we use an https agent
const abortableFetch = AbortableFetch(agent.getHttpFetch(process.env));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fetchWithTimeout = toFetch(
  setFetchTimeout(DEFAULT_REQUEST_TIMEOUT_MS as Millisecond, abortableFetch)
);

const fetchApi: typeof fetchWithTimeout =
  nodeFetch as unknown as typeof fetchWithTimeout;

export const apiClient: ReturnType<typeof createClient<"SubscriptionKey">> =
  createClient<"SubscriptionKey">({
    baseUrl: adminBaseUrl,
    fetchApi,

    withDefaults: op => params => op({ SubscriptionKey: adminToken, ...params })
  });

export type APIClient = typeof apiClient;
