// eslint-disable-next-line no-undef
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["dist", "/node_modules", "__integrations__"],
  testRegex: "(/__tests__/.*\\.(test|spec))\\.(jsx?|tsx?)$"
};
