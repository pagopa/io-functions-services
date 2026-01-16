import pagopa from "@pagopa/eslint-config";

export default [
  ...pagopa,
  {
    ignores: ["dist/**", "generated/**", "node_modules/**"]
  },
  {
    rules: {
      ...pagopa[2].rules,
      "vitest/no-conditional-expect": "off"
    }
  }
];
