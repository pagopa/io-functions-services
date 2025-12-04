import { agent } from "@pagopa/ts-commons";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "@pagopa/ts-commons/lib/fetch";
import { Millisecond } from "@pagopa/ts-commons/lib/units";
import nodeFetch from "node-fetch";

import { createClient } from "../generated/pagopa-ecommerce/client";
import { getConfigOrThrow } from "../utils/config";

const config = getConfigOrThrow();

export const baseUrl = config.PAGOPA_ECOMMERCE_BASE_URL;
export const apiKey = config.PAGOPA_ECOMMERCE_API_KEY;

// 5 seconds timeout by default
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

// Must be an https endpoint so we use an https agent
const abortableFetch = AbortableFetch(agent.getHttpsFetch(process.env));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fetchWithTimeout = toFetch(
  setFetchTimeout(DEFAULT_REQUEST_TIMEOUT_MS as Millisecond, abortableFetch)
);
const fetchApi: typeof fetchWithTimeout =
  nodeFetch as unknown as typeof fetchWithTimeout;

export const pagoPaEcommerceClient = createClient<"ApiKeyAuth">({
  baseUrl,
  fetchApi,

  withDefaults: op => params =>
    op({ ApiKeyAuth: apiKey, ...params, id_cart: "" })
});

export type PagoPaEcommerceClient = typeof pagoPaEcommerceClient;
