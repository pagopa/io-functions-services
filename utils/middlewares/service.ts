import { IRequestMiddleware } from "io-functions-commons/dist/src/utils/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";

import { Logo as ApiLogo } from "../../generated/definitions/Logo";
import { ServicePayload } from "../../generated/definitions/ServicePayload";
import { SubscriptionKeyTypePayload } from "../../generated/definitions/SubscriptionKeyTypePayload";

/**
 * A middleware that extracts a Service payload from a request.
 */
export const ServicePayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  ServicePayload
> = request =>
  Promise.resolve(
    ServicePayload.decode(request.body).mapLeft(
      ResponseErrorFromValidationErrors(ServicePayload)
    )
  );

/**
 * A middleware that extracts a SubscriptionKeyType payload from a request.
 */
export const SubscriptionKeyTypePayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  SubscriptionKeyTypePayload
> = request =>
  Promise.resolve(
    SubscriptionKeyTypePayload.decode(request.body).mapLeft(
      ResponseErrorFromValidationErrors(SubscriptionKeyTypePayload)
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
      ResponseErrorFromValidationErrors(ApiLogo)
    )
  );
