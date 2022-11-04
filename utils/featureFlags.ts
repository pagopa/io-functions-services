import * as t from "io-ts";

export const FeatureFlag = t.union([
  t.literal("all"),
  t.literal("beta"),
  t.literal("canary"),
  t.literal("none")
]);
export type FeatureFlag = t.TypeOf<typeof FeatureFlag>;

export const getIsUserForFeatureFlag = <T>(
  isUserBeta: (i: T) => boolean,
  isUserCanary: (i: T) => boolean,
  featureFlag: FeatureFlag
): ((i: T) => boolean) => (i): boolean => {
  switch (featureFlag) {
    case "all":
      return true;
    case "beta":
      return isUserBeta(i);
    case "canary":
      return isUserCanary(i) || isUserBeta(i);
    case "none":
      return false;
    default:
      return false;
  }
};
