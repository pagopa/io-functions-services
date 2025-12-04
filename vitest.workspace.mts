import { defineWorkspace } from "vitest/config";

// defineWorkspace provides a nice type hinting DX
export default defineWorkspace([
  {
    extends: "apps/io-functions-services/vite.config.mts",
    test: {
      name: "io-functions-services",
      include: ["apps/io-functions-services/**/__tests__/*.spec.ts"],
      environment: "node",
    },
  }
]);