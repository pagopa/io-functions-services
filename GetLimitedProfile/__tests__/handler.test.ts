import * as fc from "fast-check";
import { left, right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import {
  EmailString,
  FiscalCode,
  NonEmptyString
} from "italia-ts-commons/lib/strings";

import { fromLeft } from "fp-ts/lib/IOEither";
import { taskEither } from "fp-ts/lib/TaskEither";
import {
  clientIpArb,
  fiscalCodeArb,
  retrievedProfileArb
} from "../../utils/__tests__/arbitraries";
import { retrievedProfileToLimitedProfile } from "../../utils/profile";
import { GetLimitedProfileHandler } from "../handler";

// tslint:disable-next-line: no-big-function
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
            findLastVersionByModelId: jest.fn(() => fromLeft({}))
          } as unknown) as ProfileModel;
          const limitedProfileHandler = GetLimitedProfileHandler(
            mockProfileModel
          );

          const response = await limitedProfileHandler(
            {
              ...mockAzureApiAuthorization,
              groups: new Set([UserGroup.ApiMessageWrite])
            },
            clientIp,
            mockAzureUserAttributes,
            fiscalCode
          );

          expect(
            mockProfileModel.findLastVersionByModelId
          ).toHaveBeenCalledTimes(1);
          expect(mockProfileModel.findLastVersionByModelId).toBeCalledWith([
            fiscalCode
          ]);
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
            findLastVersionByModelId: jest.fn(() => taskEither.of(none))
          } as unknown) as ProfileModel;
          const limitedProfileHandler = GetLimitedProfileHandler(
            mockProfileModel
          );

          const response = await limitedProfileHandler(
            {
              ...mockAzureApiAuthorization,
              groups: new Set([UserGroup.ApiMessageWrite])
            },
            clientIp,
            mockAzureUserAttributes,
            fiscalCode
          );

          expect(
            mockProfileModel.findLastVersionByModelId
          ).toHaveBeenCalledTimes(1);
          expect(mockProfileModel.findLastVersionByModelId).toBeCalledWith([
            fiscalCode
          ]);
          expect(response.kind).toBe("IResponseErrorNotFound");
        }
      )
    );
  });

  it("should respond with ResponseErrorNotFound when the requested profile doesn't have the inbox enabled", async () => {
    await fc.assert(
      fc.asyncProperty(
        clientIpArb,
        fiscalCodeArb,
        retrievedProfileArb,
        async (clientIp, fiscalCode, retrievedProfile) => {
          const retrievedProfileWithInboxDisabled: RetrievedProfile = {
            ...retrievedProfile,
            isInboxEnabled: false
          };
          const mockProfileModel = ({
            findLastVersionByModelId: jest.fn(() =>
              taskEither.of(some(retrievedProfileWithInboxDisabled))
            )
          } as unknown) as ProfileModel;
          const limitedProfileHandler = GetLimitedProfileHandler(
            mockProfileModel
          );

          const response = await limitedProfileHandler(
            {
              ...mockAzureApiAuthorization,
              groups: new Set([UserGroup.ApiMessageWrite])
            },
            clientIp,
            mockAzureUserAttributes,
            fiscalCode
          );

          expect(
            mockProfileModel.findLastVersionByModelId
          ).toHaveBeenCalledTimes(1);
          expect(mockProfileModel.findLastVersionByModelId).toBeCalledWith([
            fiscalCode
          ]);
          expect(response.kind).toBe("IResponseErrorNotFound");
        }
      )
    );
  });

  it("should respond with 403 when the requested profile is found in the db but the service is sandboxed", async () => {
    await fc.assert(
      fc.asyncProperty(
        clientIpArb,
        fiscalCodeArb,
        retrievedProfileArb,
        async (clientIp, fiscalCode, retrievedProfile) => {
          const mockProfileModel = ({
            findLastVersionByModelId: jest.fn(() =>
              taskEither.of(some(retrievedProfile))
            )
          } as unknown) as ProfileModel;
          const limitedProfileHandler = GetLimitedProfileHandler(
            mockProfileModel
          );

          const response = await limitedProfileHandler(
            {
              ...mockAzureApiAuthorization,
              groups: new Set([UserGroup.ApiLimitedMessageWrite])
            },
            clientIp,
            {
              ...mockAzureUserAttributes,
              service: {
                ...mockAzureUserAttributes.service,
                authorizedRecipients: new Set(["ABC" as FiscalCode])
              }
            },
            fiscalCode
          );

          expect(
            mockProfileModel.findLastVersionByModelId
          ).not.toHaveBeenCalled();
          expect(response.kind).toBe(
            "IResponseErrorForbiddenNotAuthorizedForRecipient"
          );
        }
      )
    );
  });

  it("should respond with ResponseSuccessJson when the requested profile is found in the db, the service is sandboxed but can write messages to the profile fiscal code", async () => {
    await fc.assert(
      fc.asyncProperty(
        clientIpArb,
        fiscalCodeArb,
        retrievedProfileArb,
        async (clientIp, fiscalCode, retrievedProfile) => {
          const mockProfileModel = ({
            findLastVersionByModelId: jest.fn(() =>
              taskEither.of(some(retrievedProfile))
            )
          } as unknown) as ProfileModel;
          const limitedProfileHandler = GetLimitedProfileHandler(
            mockProfileModel
          );

          const response = await limitedProfileHandler(
            {
              ...mockAzureApiAuthorization,
              groups: new Set([UserGroup.ApiLimitedMessageWrite])
            },
            clientIp,
            {
              ...mockAzureUserAttributes,
              service: {
                ...mockAzureUserAttributes.service,
                authorizedRecipients: new Set([fiscalCode])
              }
            },
            fiscalCode
          );

          expect(
            mockProfileModel.findLastVersionByModelId
          ).toHaveBeenCalledTimes(1);
          expect(mockProfileModel.findLastVersionByModelId).toBeCalledWith([
            fiscalCode
          ]);
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

  it("should respond with ResponseSuccessJson when the requested profile is found in the db", async () => {
    await fc.assert(
      fc.asyncProperty(
        clientIpArb,
        fiscalCodeArb,
        retrievedProfileArb,
        async (clientIp, fiscalCode, retrievedProfile) => {
          const mockProfileModel = ({
            findLastVersionByModelId: jest.fn(() =>
              taskEither.of(some(retrievedProfile))
            )
          } as unknown) as ProfileModel;
          const limitedProfileHandler = GetLimitedProfileHandler(
            mockProfileModel
          );

          const response = await limitedProfileHandler(
            {
              ...mockAzureApiAuthorization,
              groups: new Set([UserGroup.ApiMessageWrite])
            },
            clientIp,
            mockAzureUserAttributes,
            fiscalCode
          );

          expect(
            mockProfileModel.findLastVersionByModelId
          ).toHaveBeenCalledTimes(1);
          expect(mockProfileModel.findLastVersionByModelId).toBeCalledWith([
            fiscalCode
          ]);
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
