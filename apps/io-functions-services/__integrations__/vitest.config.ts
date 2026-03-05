import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Integration tests can be slow, allow generous timeout
    testTimeout: 60000,
    hookTimeout: 60000,
    // Run serially (equivalent to jest --runInBand)
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
});
