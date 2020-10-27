import { ServiceScopeEnum } from "io-functions-commons/dist/generated/definitions/ServiceScope";
import { ServiceMetadata } from "io-functions-commons/dist/src/models/service";
import { ResponseErrorValidation } from "italia-ts-commons/lib/responses";
import { serviceVisibleMetadataCheckTask } from "../subscription";

describe("serviceVisibleMetadataCheckTask", () => {
  it("should respond with serviceMetadata for a visible service if service metadata are definend", () => {
    const serviceMetadata: ServiceMetadata = {
      scope: ServiceScopeEnum.LOCAL
    };
    const isVisible: boolean = true;

    return serviceVisibleMetadataCheckTask(serviceMetadata, isVisible)
      .run()
      .then(result => expect(result.isRight()).toBe(true));
  });

  it("should respond with ErrorResponses for a visible service if service metadata are not definend", () => {
    const serviceMetadata: ServiceMetadata = undefined;
    const isVisible: boolean = true;

    return serviceVisibleMetadataCheckTask(serviceMetadata, isVisible)
      .run()
      .then(error => expect(error.isLeft()).toBe(true));
  });
});
