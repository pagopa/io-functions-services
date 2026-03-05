import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
    hookTimeout: 60000,
    include: ["**/*.test.ts"],
    // Run serially (equivalent to jest --runInBand)
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    // Integration tests can be slow, allow generous timeout
    testTimeout: 60000
  }
});
