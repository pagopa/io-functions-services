import { InvocationContext } from "@azure/functions";
import { vi } from "vitest";

export const info = vi.fn(console.info);
export const error = vi.fn(console.error);

export const mockContext = {
  error,
  info
} as unknown as InvocationContext;
