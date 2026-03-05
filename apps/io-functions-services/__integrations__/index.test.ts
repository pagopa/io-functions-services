import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import nodeFetch from "node-fetch";
import { exit } from "process";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { SHOW_LOGS, WAIT_MS } from "./env";
import { LimitedProfile } from "./generated/fn-services/LimitedProfile";

const MAX_ATTEMPT = 50;
vi.setConfig({ testTimeout: WAIT_MS * MAX_ATTEMPT });

const baseUrl = "http://localhost:7071";

// ---------------------------------------------------------------------------
// Fixture constants — must match docker/fixtures/src/data/data.ts
// ---------------------------------------------------------------------------

/** Legacy mode, inbox enabled; aDisabledServiceId is inbox-blocked */
const aLegacyInboxEnabledFiscalCode = "AAABBB01C02D345L" as FiscalCode;
/** Legacy mode, inbox enabled; no service explicitly blocked */
const aLegacyInboxDisabledFiscalCode = "AAABBB01C02D345I" as FiscalCode;
/** AUTO service-preference mode; anEnabledServiceId enabled, aDisabledServiceId disabled */
const anAutoFiscalCode = "AAABBB01C02D345A" as FiscalCode;
/** MANUAL service-preference mode; anEnabledServiceId explicitly enabled */
const aManualFiscalCode = "AAABBB01C02D345M" as FiscalCode;
/** Fiscal code not present in any fixture */
const aNonExistingFiscalCode = "AAABBB01C02D345N" as FiscalCode;

const anEnabledServiceId = "anEnabledServiceId";
const aDisabledServiceId = "aDisabledServiceId";

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const makeHeaders = (serviceId: string = anEnabledServiceId) => ({
  "Ocp-Apim-Subscription-Key": "aSubscriptionKey",
  "x-forwarded-for": "0.0.0.0",
  "x-functions-key": "unused",
  "x-subscription-id": serviceId,
  "x-user-email": "unused@example.com",
  "x-user-groups":
    "ApiUserAdmin,ApiLimitedProfileRead,ApiFullProfileRead,ApiProfileWrite,ApiDevelopmentProfileWrite,ApiServiceRead,ApiServiceList,ApiServiceWrite,ApiPublicServiceRead,ApiPublicServiceList,ApiServiceByRecipientQuery,ApiMessageRead,ApiMessageWrite,ApiMessageWriteDefaultAddress,ApiMessageList,ApiSubscriptionsFeedRead,ApiInfoRead,ApiDebugRead",
  "x-user-id": "unused",
  "x-user-note": "unused"
});

const apiFetch = (
  serviceId: string = anEnabledServiceId
): typeof fetch => async (input, init) => {
  const headers = { ...(init?.headers ?? {}), ...makeHeaders(serviceId) };
  if (SHOW_LOGS) {
    console.log("Sending request", input, headers);
  }
  const res = await ((nodeFetch as unknown) as typeof fetch)(input, {
    ...init,
    headers
  });
  if (SHOW_LOGS) {
    console.log("Result:", res.status);
  }
  return res;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Helpers for the two profile endpoints
// ---------------------------------------------------------------------------

const getProfile = (
  fiscalCode: string,
  serviceId = anEnabledServiceId
): Promise<Response> =>
  apiFetch(serviceId)(`${baseUrl}/api/v1/profiles/${fiscalCode}`, {
    method: "GET"
  });

const getProfileByPOST = (
  fiscalCode: string,
  serviceId = anEnabledServiceId
): Promise<Response> =>
  apiFetch(serviceId)(`${baseUrl}/api/v1/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fiscal_code: fiscalCode })
  });

// ---------------------------------------------------------------------------
// Global setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  for (let i = 0; i < MAX_ATTEMPT; i++) {
    try {
      await nodeFetch(`${baseUrl}/api/info`);
      return;
    } catch {
      console.log(`Waiting for function host to start (attempt ${i + 1})…`);
      await delay(WAIT_MS);
    }
  }
  console.log("Function host failed to start in time");
  exit(1);
});

afterAll(async () => {
  /* nothing to tear down */
});

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// GetLimitedProfile — GET /api/v1/profiles/:fiscalCode
// ---------------------------------------------------------------------------

describe("GetLimitedProfile — GET /api/v1/profiles/:fiscalCode", () => {
  it("returns 200 with sender_allowed:true for a legacy profile when the calling service is enabled", async () => {
    const res = await getProfile(
      aLegacyInboxEnabledFiscalCode,
      anEnabledServiceId
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LimitedProfile;
    expect(body.sender_allowed).toBe(true);
  });

  it("returns 200 with sender_allowed:false for a legacy profile when the calling service is blocked", async () => {
    const res = await getProfile(
      aLegacyInboxEnabledFiscalCode,
      aDisabledServiceId
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LimitedProfile;
    expect(body.sender_allowed).toBe(false);
  });

  it("returns 200 for a legacy profile that has inbox disabled but no service blocked", async () => {
    const res = await getProfile(
      aLegacyInboxDisabledFiscalCode,
      anEnabledServiceId
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LimitedProfile;
    expect(typeof body.sender_allowed).toBe("boolean");
  });

  it("returns 200 with sender_allowed:true for an AUTO profile with an explicitly enabled service preference", async () => {
    const res = await getProfile(anAutoFiscalCode, anEnabledServiceId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as LimitedProfile;
    expect(body.sender_allowed).toBe(true);
  });

  it("returns 200 with sender_allowed:false for an AUTO profile with an explicitly disabled service preference", async () => {
    const res = await getProfile(anAutoFiscalCode, aDisabledServiceId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as LimitedProfile;
    expect(body.sender_allowed).toBe(false);
  });

  it("returns 200 with sender_allowed:true for a MANUAL profile with an explicitly enabled service preference", async () => {
    const res = await getProfile(aManualFiscalCode, anEnabledServiceId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as LimitedProfile;
    expect(body.sender_allowed).toBe(true);
  });

  it("returns 404 for a fiscal code not present in the system", async () => {
    const res = await getProfile(aNonExistingFiscalCode);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GetLimitedProfileByPOST — POST /api/v1/profiles
// ---------------------------------------------------------------------------

describe("GetLimitedProfileByPOST — POST /api/v1/profiles", () => {
  it("returns 200 with sender_allowed:true for a legacy profile when the calling service is enabled", async () => {
    const res = await getProfileByPOST(
      aLegacyInboxEnabledFiscalCode,
      anEnabledServiceId
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LimitedProfile;
    expect(body.sender_allowed).toBe(true);
  });

  it("returns 200 with sender_allowed:false for a legacy profile when the calling service is blocked", async () => {
    const res = await getProfileByPOST(
      aLegacyInboxEnabledFiscalCode,
      aDisabledServiceId
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LimitedProfile;
    expect(body.sender_allowed).toBe(false);
  });

  it("returns 200 with sender_allowed:true for an AUTO profile with an explicitly enabled service preference", async () => {
    const res = await getProfileByPOST(anAutoFiscalCode, anEnabledServiceId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as LimitedProfile;
    expect(body.sender_allowed).toBe(true);
  });

  it("returns 200 with sender_allowed:false for an AUTO profile with an explicitly disabled service preference", async () => {
    const res = await getProfileByPOST(anAutoFiscalCode, aDisabledServiceId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as LimitedProfile;
    expect(body.sender_allowed).toBe(false);
  });

  it("returns 200 with sender_allowed:true for a MANUAL profile with an explicitly enabled service preference", async () => {
    const res = await getProfileByPOST(aManualFiscalCode, anEnabledServiceId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as LimitedProfile;
    expect(body.sender_allowed).toBe(true);
  });

  it("returns 400 when the request body is missing the fiscal_code field", async () => {
    const res = await apiFetch()(`${baseUrl}/api/v1/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a fiscal code not present in the system", async () => {
    const res = await getProfileByPOST(aNonExistingFiscalCode);
    expect(res.status).toBe(404);
  });
});
