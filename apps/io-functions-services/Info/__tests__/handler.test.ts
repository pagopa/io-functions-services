import * as healthcheck from "@pagopa/io-functions-commons/dist/src/utils/healthcheck";
import * as TE from "fp-ts/lib/TaskEither";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InfoHandler } from "../handler";

afterEach(() => {
  vi.clearAllMocks();
});

describe("InfoHandler", () => {
  it("should return an internal error if the application is not healthy", async () => {
    const healthCheck: healthcheck.HealthCheck<"Config"> = TE.left([
      "failure 1" as healthcheck.HealthProblem<"Config">,
      "failure 2" as healthcheck.HealthProblem<"Config">
    ]);
    const handler = InfoHandler(() => healthCheck);

    const response = await handler();

    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return a success if the application is healthy", async () => {
    const healthCheck: healthcheck.HealthCheck<"Config"> = TE.of(true);
    const handler = InfoHandler(() => healthCheck);

    const response = await handler();

    expect(response.kind).toBe("IResponseSuccessJson");
  });
});
