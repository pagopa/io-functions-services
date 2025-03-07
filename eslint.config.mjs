import pagopa from "@pagopa/eslint-config";

export default [
  ...pagopa,
  {
    rules: {
      "comma-dangle": "off",
      "perfectionist/sort-classes": "off",
      "perfectionist/sort-enums": "off",
      "perfectionist/sort-interfaces": "off",
      "perfectionist/sort-intersection-types": "off",
      "perfectionist/sort-objects": "off",
      "perfectionist/sort-object-types": "off",
      "perfectionist/sort-union-types": "off",
      "@typescript-eslint/array-type": ["error", { default: "generic" }],
      "@typescript-eslint/no-inferrable-types": "off"
    }
  },
  {
    ignores: [
      "node_modules",
      "generated",
      "dist",
      "docker/*",
      "**/__integrations__/*",
      "**/__tests__/*",
      "**/__mocks__/*",
      "Dangerfile.*",
      "**/*.d.ts"
    ]
  }
];
