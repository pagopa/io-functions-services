module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["dist", "/node_modules"],
  testRegex: "(/__tests__/.*\\.(test|spec))\\.(jsx?|tsx?)$",
};
