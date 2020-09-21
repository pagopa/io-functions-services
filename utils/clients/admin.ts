import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import nodeFetch from "node-fetch";
import { createClient } from "../../generated/api-admin/client";

export const adminBaseUrl = getRequiredStringEnv("IO_FUNCTIONS_ADMIN_BASE_URL");
export const adminToken = getRequiredStringEnv("IO_FUNCTIONS_ADMIN_API_TOKEN");
// tslint:disable-next-line: no-any
const fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch;

export const apiClient = createClient<"SubscriptionKey">({
  baseUrl: adminBaseUrl,
  fetchApi,
  withDefaults: op => params => op({ SubscriptionKey: adminToken, ...params })
});

export type APIClient = typeof apiClient;
