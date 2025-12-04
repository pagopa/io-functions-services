/* eslint-disable @typescript-eslint/no-unused-vars */
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { describe, expect, it } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import { aFiscalCode, anotherFiscalCode } from "../../__mocks__/mocks";
import {
  FeatureFlagEnum,
  getIsUserEligibleForNewFeature
} from "../featureFlag";

const betaUsers: FiscalCode[] = [aFiscalCode];
const isUserBeta = (fc: FiscalCode) => betaUsers.includes(fc);

describe("isUserForFeatureFlag", () => {
  it("should return true when featureFlag === all", () => {
    const isUserForFeatureFlag = getIsUserEligibleForNewFeature(
      isUserBeta,
      _ => false,
      FeatureFlagEnum.ALL
    );
    expect(isUserForFeatureFlag(aFiscalCode)).toBeTruthy();
  });

  it("should return false when featureFlag === beta and the user is not beta", () => {
    const isUserForFeatureFlag = getIsUserEligibleForNewFeature(
      isUserBeta,
      _ => false,
      FeatureFlagEnum.BETA
    );
    expect(isUserForFeatureFlag(anotherFiscalCode)).toBeFalsy();
  });

  it("should return true when featureFlag === beta and the first callback return true", () => {
    const isUserForFeatureFlag = getIsUserEligibleForNewFeature(
      isUserBeta,
      _ => false,
      FeatureFlagEnum.BETA
    );
    expect(isUserForFeatureFlag(aFiscalCode)).toBeTruthy();
  });

  it("should return false when featureFlag === canary and callbacks return false", () => {
    const isUserForFeatureFlag = getIsUserEligibleForNewFeature(
      isUserBeta,
      _ => false,
      FeatureFlagEnum.CANARY
    );
    expect(isUserForFeatureFlag(anotherFiscalCode)).toBeFalsy();
  });

  it("should return true when featureFlag === canary and the first callback return true", () => {
    const isUserForFeatureFlag = getIsUserEligibleForNewFeature(
      isUserBeta,
      _ => false,
      FeatureFlagEnum.CANARY
    );
    expect(isUserForFeatureFlag(aFiscalCode)).toBeTruthy();
  });

  it("should return true when featureFlag === canary and the second callback return true", () => {
    const isUserForFeatureFlag = getIsUserEligibleForNewFeature(
      isUserBeta,
      _ => true,
      FeatureFlagEnum.CANARY
    );
    expect(isUserForFeatureFlag(anotherFiscalCode)).toBeTruthy();
  });

  it("should return false when featureFlag === none", () => {
    const isUserForFeatureFlag = getIsUserEligibleForNewFeature(
      isUserBeta,
      _ => true,
      FeatureFlagEnum.NONE
    );
    expect(isUserForFeatureFlag(aFiscalCode)).toBeFalsy();
  });
});
