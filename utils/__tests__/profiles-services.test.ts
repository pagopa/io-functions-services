import * as o from "fp-ts/lib/Option";
import * as e from "fp-ts/lib/Either";
import * as te from "fp-ts/lib/TaskEither";
import * as t from "fp-ts/lib/Task";
import * as a from "fp-ts/lib/Array";
import {
  handleAll,
  profileWithPreferenceVersionWithModeAuto,
  profileWithPreferenceVersionWithModeManual,
  profileWithModeLegacy
} from "../profile-services";
import * as arb from "./arbitraries";
import * as fc from "fast-check";
import {
  ServicesPreferencesModel,
  RetrievedServicePreference
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";

const mockServicesPreferencesModelWithError = ({
  find: jest.fn(() => te.fromLeft({}))
} as unknown) as ServicesPreferencesModel;

describe("profiles-services-test", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("test sequence with task", async () => {
    const result = await a.array
      .sequence(t.taskSeq)([
        t.task.of<e.Either<string, string>>(e.right("OK")),
        t.task.of(e.left("KO"))
      ])
      .run();
    expect(result.some(e.isRight)).toBe(true);
    expect(result.some(e.isLeft)).toBe(true);
    expect(result.find(e.isRight).value).toBe("OK");
  });

  const getServicesPreferencesResults = (
    servicePref: RetrievedServicePreference
  ): te.TaskEither<CosmosErrors, o.Option<RetrievedServicePreference>> =>
    te.right<CosmosErrors, o.Option<RetrievedServicePreference>>(
      t.task.of(o.some(servicePref))
    );

  it("GIVEN a valid profile with service preference mode to AUTO, WHEN profileWithPreferenceVersionWithModeAuto is called, THEN the handler must return a LimitedProfile allowing sending message", async () => {
    await fc.assert(
      fc.asyncProperty(
        arb.retrievedProfileAuto,
        arb.retrievedServicesPreferencesEnabled,
        async (profile, servicePref) => {
          const mockServicesPreferencesModel = ({
            find: jest.fn(() => getServicesPreferencesResults(servicePref))
          } as unknown) as ServicesPreferencesModel;
          const handlerCheck = profileWithPreferenceVersionWithModeAuto.isMyReposability(
            profile
          );
          expect(handlerCheck).toBe(true);
          const handlerExec = await profileWithPreferenceVersionWithModeAuto
            .handleProfile(
              profile,
              mockServicesPreferencesModel,
              "1" as ServiceId
            )
            .run();
          expect(handlerExec.sender_allowed).toBe(true);
        }
      )
    );
  });

  it("GIVEN a profile missing service-preferences with service preference mode to AUTO, WHEN profileWithPreferenceVersionWithModeAuto is called, THEN the handler must return a LimitedProfile allowing sending message", async () => {
    await fc.assert(
      fc.asyncProperty(
        arb.retrievedProfileAuto,
        arb.retrievedServicesPreferencesEnabled,
        async (profile, _servicePref) => {
          const handlerCheck = profileWithPreferenceVersionWithModeAuto.isMyReposability(
            profile
          );
          expect(handlerCheck).toBe(true);
          const handlerExec = await profileWithPreferenceVersionWithModeAuto
            .handleProfile(
              profile,
              mockServicesPreferencesModelWithError,
              "1" as ServiceId
            )
            .run();
          expect(handlerExec.sender_allowed).toBe(true);
        }
      )
    );
  });

  it("GIVEN a not enabled profile with service preference mode to AUTO, WHEN profileWithPreferenceVersionWithModeAuto is called, THE the handler must return a LimitedProfile not allowing sending message", async () => {
    await fc.assert(
      fc.asyncProperty(
        arb.retrievedProfileAuto,
        arb.retrievedServicesPreferencesDisabled,
        async (profile, servicePref) => {
          const mockServicesPreferencesModel = ({
            find: jest.fn(() => getServicesPreferencesResults(servicePref))
          } as unknown) as ServicesPreferencesModel;
          const handlerCheck = profileWithPreferenceVersionWithModeAuto.isMyReposability(
            profile
          );
          expect(handlerCheck).toBe(true);
          const handlerExec = await profileWithPreferenceVersionWithModeAuto
            .handleProfile(
              profile,
              mockServicesPreferencesModel,
              "1" as ServiceId
            )
            .run();
          expect(handlerExec.sender_allowed).toBe(false);
        }
      )
    );
  });

  it("GIVEN a valid profile with service preference mode to MANUAL, WHEN profileWithPreferenceVersionWithModeManual is called, THEN the handler must return a LimitedProfile allowing sending message", async () => {
    await fc.assert(
      fc.asyncProperty(
        arb.retrievedProfileManual,
        arb.retrievedServicesPreferencesEnabled,
        async (profile, servicePref) => {
          const mockServicesPreferencesModel = ({
            find: jest.fn(() => getServicesPreferencesResults(servicePref))
          } as unknown) as ServicesPreferencesModel;
          const handlerCheck = profileWithPreferenceVersionWithModeManual.isMyReposability(
            profile
          );
          expect(handlerCheck).toBe(true);
          const handlerExec = await profileWithPreferenceVersionWithModeManual
            .handleProfile(
              profile,
              mockServicesPreferencesModel,
              "1" as ServiceId
            )
            .run();
          expect(handlerExec.sender_allowed).toBe(true);
        }
      )
    );
  });

  it("GIVEN a profile missing service-preferences with service preference mode to MANUAL, WHEN profileWithPreferenceVersionWithModeManual is called, THEN the handler must return a LimitedProfile not allowing sending message", async () => {
    await fc.assert(
      fc.asyncProperty(
        arb.retrievedProfileManual,
        arb.retrievedServicesPreferencesEnabled,
        async (profile, servicePref) => {
          const handlerCheck = profileWithPreferenceVersionWithModeManual.isMyReposability(
            profile
          );
          expect(handlerCheck).toBe(true);
          const handlerExec = await profileWithPreferenceVersionWithModeManual
            .handleProfile(
              profile,
              mockServicesPreferencesModelWithError,
              "1" as ServiceId
            )
            .run();
          expect(handlerExec.sender_allowed).toBe(false);
        }
      )
    );
  });

  it("GIVEN a not enabled profile with service preference mode to MANUAL, WHEN profileWithPreferenceVersionWithModeManual is called, THE the handler must return a LimitedProfile not allowing sending message", async () => {
    await fc.assert(
      fc.asyncProperty(
        arb.retrievedProfileManual,
        arb.retrievedServicesPreferencesDisabled,
        async (profile, servicePref) => {
          const mockServicesPreferencesModel = ({
            find: jest.fn(() => getServicesPreferencesResults(servicePref))
          } as unknown) as ServicesPreferencesModel;
          const handlerCheck = profileWithPreferenceVersionWithModeManual.isMyReposability(
            profile
          );
          expect(handlerCheck).toBe(true);
          const handlerExec = await profileWithPreferenceVersionWithModeManual
            .handleProfile(
              profile,
              mockServicesPreferencesModel,
              "1" as ServiceId
            )
            .run();
          expect(handlerExec.sender_allowed).toBe(false);
        }
      )
    );
  });

  it("GIVEN a valid profile with service preference mode to LEGACY, WHEN profileWithModeLegacy is called, THEN the handler must return a LimitedProfile allowing sending message", async () => {
    await fc.assert(
      fc.asyncProperty(arb.retrievedProfileArb, async profile => {
        const handlerCheck = profileWithModeLegacy.isMyReposability(profile);
        expect(
          mockServicesPreferencesModelWithError.find
        ).not.toHaveBeenCalled();
        expect(handlerCheck).toBe(true);
        const handlerExec = await profileWithModeLegacy
          .handleProfile(
            profile,
            mockServicesPreferencesModelWithError,
            "1" as ServiceId
          )
          .run();
        expect(handlerExec.sender_allowed).toBe(true);
      })
    );
  });

  it("GIVEN a profile missing service-preferences with service preference mode to AUTO, WHEN handleAll is called, THEN the handler must return a LimitedProfile allowing sending message", async () => {
    await fc.assert(
      fc.asyncProperty(
        arb.retrievedProfileAuto,
        arb.retrievedServicesPreferencesEnabled,
        async (profile, _servicePref) => {
          const handlerExec = await handleAll()(
            profile,
            mockServicesPreferencesModelWithError,
            "1" as ServiceId
          ).run();
          expect(mockServicesPreferencesModelWithError.find).toHaveBeenCalled();
          expect(handlerExec.isRight()).toBe(true);
          expect(
            handlerExec.getOrElse({ sender_allowed: false }).sender_allowed
          ).toBe(true);
        }
      )
    );
  });

  it("GIVEN a profile missing service-preferences with service preference mode to MANUAL, WHEN handleAll is called, THEN the handler must return a LimitedProfile not allowing sending message", async () => {
    await fc.assert(
      fc.asyncProperty(
        arb.retrievedProfileManual,
        arb.retrievedServicesPreferencesEnabled,
        async (profile, _servicePref) => {
          const handlerExec = await handleAll()(
            profile,
            mockServicesPreferencesModelWithError,
            "1" as ServiceId
          ).run();
          expect(mockServicesPreferencesModelWithError.find).toHaveBeenCalled();
          expect(handlerExec.isRight()).toBe(true);
          expect(
            handlerExec.getOrElse({ sender_allowed: false }).sender_allowed
          ).toBe(false);
        }
      )
    );
  });

  it("GIVEN a profile with setting preference verison to -1 and service preference mode to AUTO, WHEN handleAll is called, THEN the handler must return a NotFound", async () => {
    await fc.assert(
      fc.asyncProperty(
        arb.retrievedProfileUnhandled,
        arb.retrievedServicesPreferencesEnabled,
        async (profile, _servicePref) => {
          const handlerExec = await handleAll()(
            profile,
            mockServicesPreferencesModelWithError,
            "1" as ServiceId
          ).run();
          expect(
            mockServicesPreferencesModelWithError.find
          ).not.toHaveBeenCalled();
          expect(handlerExec.isLeft()).toBe(true);
          expect(handlerExec.swap().getOrElse(undefined).kind).toBe(
            "IResponseErrorNotFound"
          );
        }
      )
    );
  });
});
