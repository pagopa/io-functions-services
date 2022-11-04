import { getIsUserForFeatureFlag } from "../featureFlags";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { aFiscalCode, anotherFiscalCode } from "../../__mocks__/mocks";

const betaUsers: FiscalCode[] = [aFiscalCode];
const isUserBeta = (fc: FiscalCode) => betaUsers.includes(fc);

describe("isUserForFeatureFlag", () => {
  it("should return true when featureFlag === all", () => {
    const isUserForFeatureFlag = getIsUserForFeatureFlag(
      isUserBeta,
      _ => false,
      "all"
    );
    expect(isUserForFeatureFlag(aFiscalCode)).toBeTruthy();
  });

  it("should return false when featureFlag === beta and the user is not beta", () => {
    const isUserForFeatureFlag = getIsUserForFeatureFlag(
      isUserBeta,
      _ => false,
      "beta"
    );
    expect(isUserForFeatureFlag(anotherFiscalCode)).toBeFalsy();
  });

  it("should return true when featureFlag === beta and the first callback return true", () => {
    const isUserForFeatureFlag = getIsUserForFeatureFlag(
      isUserBeta,
      _ => false,
      "beta"
    );
    expect(isUserForFeatureFlag(aFiscalCode)).toBeTruthy();
  });

  it("should return false when featureFlag === canary and callbacks return false", () => {
    const isUserForFeatureFlag = getIsUserForFeatureFlag(
      isUserBeta,
      _ => false,
      "canary"
    );
    expect(isUserForFeatureFlag(anotherFiscalCode)).toBeFalsy();
  });

  it("should return true when featureFlag === canary and the first callback return true", () => {
    const isUserForFeatureFlag = getIsUserForFeatureFlag(
      isUserBeta,
      _ => false,
      "canary"
    );
    expect(isUserForFeatureFlag(aFiscalCode)).toBeTruthy();
  });

  it("should return true when featureFlag === canary and the second callback return true", () => {
    const isUserForFeatureFlag = getIsUserForFeatureFlag(
      isUserBeta,
      _ => true,
      "canary"
    );
    expect(isUserForFeatureFlag(anotherFiscalCode)).toBeTruthy();
  });

  it("should return false when featureFlag === none", () => {
    const isUserForFeatureFlag = getIsUserForFeatureFlag(
      isUserBeta,
      _ => true,
      "none"
    );
    expect(isUserForFeatureFlag(aFiscalCode)).toBeFalsy();
  });
});
