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
import { Errors, Validation } from "io-ts";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";

describe("profiles-services-test", () => {
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
  ): AsyncIterable<ReadonlyArray<Validation<RetrievedServicePreference>>> => ({
    async *[Symbol.asyncIterator]() {
      yield [e.right<Errors, RetrievedServicePreference>(servicePref)];
    }
  });

  it("GIVEN a valid profile with service preference mode to AUTO, WHEN profileWithPreferenceVersionWithModeAuto is called, THEN the handler must return a LimitedProfile allowing sending message", async () => {
    await fc.assert(
      fc.asyncProperty(
        arb.retrievedProfileAuto,
        arb.retrievedServicesPreferencesEnabled,
        async (profile, servicePref) => {
          const mockServicesPreferencesModel = ({
            getQueryIterator: jest.fn(() =>
              getServicesPreferencesResults(servicePref)
            )
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
        async (profile, servicePref) => {
          const mockServicesPreferencesModel = ({
            getQueryIterator: jest.fn(() => te.fromLeft({}))
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

  it("GIVEN a not enabled profile with service preference mode to AUTO, WHEN profileWithPreferenceVersionWithModeAuto is called, THE the handler must return a LimitedProfile not allowing sending message", async () => {
    await fc.assert(
      fc.asyncProperty(
        arb.retrievedProfileAuto,
        arb.retrievedServicesPreferencesDisabled,
        async (profile, servicePref) => {
          const mockServicesPreferencesModel = ({
            getQueryIterator: jest.fn(() =>
              getServicesPreferencesResults(servicePref)
            )
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
            getQueryIterator: jest.fn(() =>
              getServicesPreferencesResults(servicePref)
            )
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
          const mockServicesPreferencesModel = ({
            getQueryIterator: jest.fn(() => te.fromLeft({}))
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

  it("GIVEN a not enabled profile with service preference mode to MANUAL, WHEN profileWithPreferenceVersionWithModeManual is called, THE the handler must return a LimitedProfile not allowing sending message", async () => {
    await fc.assert(
      fc.asyncProperty(
        arb.retrievedProfileManual,
        arb.retrievedServicesPreferencesDisabled,
        async (profile, servicePref) => {
          const mockServicesPreferencesModel = ({
            getQueryIterator: jest.fn(() =>
              getServicesPreferencesResults(servicePref)
            )
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
        const mockServicesPreferencesModel = ({
          getQueryIterator: jest.fn(() => te.fromLeft({}))
        } as unknown) as ServicesPreferencesModel;
        const handlerCheck = profileWithModeLegacy.isMyReposability(profile);
        expect(
          mockServicesPreferencesModel.getQueryIterator
        ).not.toHaveBeenCalled();
        expect(handlerCheck).toBe(true);
        const handlerExec = await profileWithModeLegacy
          .handleProfile(
            profile,
            mockServicesPreferencesModel,
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
        async (profile, servicePref) => {
          const mockServicesPreferencesModel = ({
            getQueryIterator: jest.fn(() => te.fromLeft({}))
          } as unknown) as ServicesPreferencesModel;
          const handlerExec = await handleAll()(
            profile,
            mockServicesPreferencesModel,
            "1" as ServiceId
          ).run();
          expect(
            mockServicesPreferencesModel.getQueryIterator
          ).toHaveBeenCalled();
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
        async (profile, servicePref) => {
          const mockServicesPreferencesModel = ({
            getQueryIterator: jest.fn(() => te.fromLeft({}))
          } as unknown) as ServicesPreferencesModel;
          const handlerExec = await handleAll()(
            profile,
            mockServicesPreferencesModel,
            "1" as ServiceId
          ).run();
          expect(
            mockServicesPreferencesModel.getQueryIterator
          ).toHaveBeenCalled();
          expect(handlerExec.isRight()).toBe(true);
          expect(
            handlerExec.getOrElse({ sender_allowed: false }).sender_allowed
          ).toBe(false);
        }
      )
    );
  });

  it("GIVEN a profile with setting preference verison to 0 and service preference mode to AUTO, WHEN handleAll is called, THEN the handler must return a NotFound", async () => {
    await fc.assert(
      fc.asyncProperty(
        arb.retrievedProfileUnhandled,
        arb.retrievedServicesPreferencesEnabled,
        async (profile, servicePref) => {
          const mockServicesPreferencesModel = ({
            getQueryIterator: jest.fn(() => te.fromLeft({}))
          } as unknown) as ServicesPreferencesModel;
          const handlerExec = await handleAll()(
            profile,
            mockServicesPreferencesModel,
            "1" as ServiceId
          ).run();
          expect(
            mockServicesPreferencesModel.getQueryIterator
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
