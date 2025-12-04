import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"]
  },
  test: {
    coverage: {
      exclude: ["dist", "**/__mocks__/**", "*.js"],
      provider: "v8",
      reporter: ["lcov", "text"]
    },
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/__mocks__/**",
      "**/__integrations__/**"
    ]
  }
});
