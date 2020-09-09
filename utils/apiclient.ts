import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { APIClient } from "./clients/admin";

export const adminBaseUrl = getRequiredStringEnv("IO_FUNCTIONS_ADMIN_BASE_URL");
export const adminToken = getRequiredStringEnv("IO_FUNCTIONS_ADMIN_API_TOKEN");

export const getApiClient = () => APIClient(adminBaseUrl, adminToken);
