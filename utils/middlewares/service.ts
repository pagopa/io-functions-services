import { Service as ApiService } from "io-functions-commons/dist/generated/definitions/Service";
import { IRequestMiddleware } from "io-functions-commons/dist/src/utils/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";

import { Logo as ApiLogo } from "../../generated/definitions/Logo";

/**
 * A middleware that extracts a Service payload from a request.
 */
export const ServicePayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  ApiService
> = request =>
  Promise.resolve(
    ApiService.decode(request.body).mapLeft(
      ResponseErrorFromValidationErrors(ApiService)
    )
  );

/**
 * A middleware that extracts a Logo payload from a request.
 */
export const LogoPayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  ApiLogo
> = request =>
  Promise.resolve(
    ApiLogo.decode(request.body).mapLeft(
      ResponseErrorFromValidationErrors(ApiService)
    )
  );
