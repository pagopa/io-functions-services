import * as fc from "fast-check";
import { left, right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import { ProfileModel } from "io-functions-commons/dist/src/models/profile";
import { IAzureApiAuthorization } from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import { EmailString, NonEmptyString } from "italia-ts-commons/lib/strings";

import {
  clientIpArb,
  fiscalCodeArb,
  retrievedProfileArb
} from "../../utils/arbitraries";
import { retrievedProfileToLimitedProfile } from "../../utils/profile";
import { GetLimitedProfileHandler } from "../handler";

describe("GetLimitedProfileHandler", () => {
  const mockAzureApiAuthorization: IAzureApiAuthorization = {
    groups: new Set(),
    kind: "IAzureApiAuthorization",
    subscriptionId: "" as NonEmptyString,
    userId: "" as NonEmptyString
  };

  const mockAzureUserAttributes: IAzureUserAttributes = {
    email: "" as EmailString,
    kind: "IAzureUserAttributes",
    service: {
      serviceId: "01234567890"
    } as IAzureUserAttributes["service"]
  };

  it("should respond with ResponseErrorQuery when a database error occurs", async () => {
    await fc.assert(
      fc.asyncProperty(
        clientIpArb,
        fiscalCodeArb,
        async (clientIp, fiscalCode) => {
          const mockProfileModel = ({
            findOneProfileByFiscalCode: jest.fn(() => Promise.resolve(left({})))
          } as unknown) as ProfileModel;
          const limitedProfileHandler = GetLimitedProfileHandler(
            mockProfileModel
          );

          const response = await limitedProfileHandler(
            mockAzureApiAuthorization,
            clientIp,
            mockAzureUserAttributes,
            fiscalCode
          );

          expect(
            mockProfileModel.findOneProfileByFiscalCode
          ).toHaveBeenCalledTimes(1);
          expect(mockProfileModel.findOneProfileByFiscalCode).toBeCalledWith(
            fiscalCode
          );
          expect(response.kind).toBe("IResponseErrorQuery");
        }
      )
    );
  });

  it("should respond with ResponseErrorNotFound when the requested profile is not found in the db", async () => {
    await fc.assert(
      fc.asyncProperty(
        clientIpArb,
        fiscalCodeArb,
        async (clientIp, fiscalCode) => {
          const mockProfileModel = ({
            findOneProfileByFiscalCode: jest.fn(() =>
              Promise.resolve(right(none))
            )
          } as unknown) as ProfileModel;
          const limitedProfileHandler = GetLimitedProfileHandler(
            mockProfileModel
          );

          const response = await limitedProfileHandler(
            mockAzureApiAuthorization,
            clientIp,
            mockAzureUserAttributes,
            fiscalCode
          );

          expect(
            mockProfileModel.findOneProfileByFiscalCode
          ).toHaveBeenCalledTimes(1);
          expect(mockProfileModel.findOneProfileByFiscalCode).toBeCalledWith(
            fiscalCode
          );
          expect(response.kind).toBe("IResponseErrorNotFound");
        }
      )
    );
  });

  it("should respond with ResponseSuccessJson when the requested profile is found in the db", async () => {
    await fc.assert(
      fc.asyncProperty(
        clientIpArb,
        fiscalCodeArb,
        retrievedProfileArb,
        async (clientIp, fiscalCode, retrievedProfile) => {
          const mockProfileModel = ({
            findOneProfileByFiscalCode: jest.fn(() =>
              Promise.resolve(right(some(retrievedProfile)))
            )
          } as unknown) as ProfileModel;
          const limitedProfileHandler = GetLimitedProfileHandler(
            mockProfileModel
          );

          const response = await limitedProfileHandler(
            mockAzureApiAuthorization,
            clientIp,
            mockAzureUserAttributes,
            fiscalCode
          );

          expect(
            mockProfileModel.findOneProfileByFiscalCode
          ).toHaveBeenCalledTimes(1);
          expect(mockProfileModel.findOneProfileByFiscalCode).toBeCalledWith(
            fiscalCode
          );
          expect(response.kind).toBe("IResponseSuccessJson");
          if (response.kind === "IResponseSuccessJson") {
            expect(response.value).toEqual(
              retrievedProfileToLimitedProfile(retrievedProfile, false)
            );
          }
        }
      )
    );
  });
});
