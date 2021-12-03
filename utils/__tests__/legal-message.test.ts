import { pipe } from "fp-ts/lib/function";
import * as LM from "../legal-message";
import * as E from "fp-ts/Either";

describe("legal-message", () => {
  const VALID_PEC = "test@legal.it";
  const VALID_SERVICE_ID = "dummy-service";

  const NOT_EXISTING_PEC = "no-test@legal.it";

  it("GIVEN a mapped email WHEN the mapper is called THEN the proper service id is returned", async () => {
    const mvlMapper = LM.of(LM.DummyLegalMessageMapModel);

    const sid = await pipe(VALID_PEC, LM.mapPecWithService(mvlMapper))();

    expect(E.isRight(sid)).toBeTruthy();
    expect(E.getOrElseW(() => fail("ERROR"))(sid)).toEqual(
      expect.objectContaining({ serviceId: VALID_SERVICE_ID })
    );
  });

  it("GIVEN a not mapped email WHEN the mapper is called THEN a Not Foud error is returned", async () => {
    const mvlMapper = LM.of(LM.DummyLegalMessageMapModel);

    const sid = await pipe(NOT_EXISTING_PEC, LM.mapPecWithService(mvlMapper))();

    expect(E.isLeft(sid)).toBeTruthy();
    expect(sid).toEqual(
      expect.objectContaining({
        left: {
          kind: "NotFoundError",
          message: "No service found for input email"
        }
      })
    );
  });
});
