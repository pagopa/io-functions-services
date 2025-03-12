/**
 * Common usages of crypto features
 */

import * as crypto from "crypto";

export const toHash = (s: string): string =>
  crypto.createHash("sha256").update(s).digest("hex");

export const randomBytes = (size: number): string =>
  crypto.randomBytes(size).toString("hex");
