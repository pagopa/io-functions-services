import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { LimitedProfile } from "@pagopa/io-functions-commons/dist/generated/definitions/LimitedProfile";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import { ServicesPreferencesModel } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { ValidService } from "@pagopa/io-functions-commons/dist/src/models/service";
import { IAzureApiAuthorization } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { IAzureUserAttributes } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import { IRequestMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import { Some, isSome } from "fp-ts/lib/Option";
import { fromEither, fromPredicate, taskEither } from "fp-ts/lib/TaskEither";
import { right } from "fp-ts/lib/Either";
import { identity } from "io-ts";
import {
  IResponseErrorForbiddenNotAuthorizedForRecipient,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorizedForRecipient,
  ResponseErrorFromValidationErrors,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { Task } from "fp-ts/lib/Task";
import { GetLimitedProfileByPOSTPayload } from "../generated/definitions/GetLimitedProfileByPOSTPayload";
import { canWriteMessage } from "../CreateMessage/handler";
import { handleAll } from "./profile-services";

/**
 * A middleware that extracts a GetLimitedProfileByPOSTPayload from a request.
 */
export const GetLimitedProfileByPOSTPayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  GetLimitedProfileByPOSTPayload
> = request =>
  Promise.resolve(
    GetLimitedProfileByPOSTPayload.decode(request.body).mapLeft(
      ResponseErrorFromValidationErrors(GetLimitedProfileByPOSTPayload)
    )
  );

export type IGetLimitedProfileResponses =
  | IResponseSuccessJson<LimitedProfile>
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseErrorForbiddenNotAuthorizedForRecipient;

export const getLimitedProfileTask = (
  apiAuthorization: IAzureApiAuthorization,
  userAttributes: IAzureUserAttributes,
  fiscalCode: FiscalCode,
  profileModel: ProfileModel,
  disableIncompleteServices: boolean,
  incompleteServiceWhitelist: ReadonlyArray<ServiceId>,
  servicesPreferencesModel: ServicesPreferencesModel
  // eslint-disable-next-line max-params
): Task<IGetLimitedProfileResponses> =>
  taskEither
    .of<
      | IResponseErrorForbiddenNotAuthorizedForRecipient
      | IResponseErrorNotFound
      | IResponseErrorQuery,
      void
    >(void 0)
    .chainSecond(
      // Sandboxed accounts will receive 403
      // if they're not authorized to send a messages to this fiscal code.
      // This prevents leaking the information, to sandboxed account,
      // that the fiscal code belongs to a subscribed user
      fromEither(
        canWriteMessage(
          apiAuthorization.groups,
          userAttributes.service.authorizedRecipients,
          fiscalCode
        )
      ).mapLeft(_ => ResponseErrorForbiddenNotAuthorizedForRecipient)
    ) // Verify if the Service has the required quality to sent message
    .chain(_ => {
      if (
        disableIncompleteServices &&
        !incompleteServiceWhitelist.includes(
          userAttributes.service.serviceId
        ) &&
        !userAttributes.service.authorizedRecipients.has(fiscalCode)
      ) {
        return fromEither(
          ValidService.decode(userAttributes.service).bimap(
            _1 => ResponseErrorForbiddenNotAuthorizedForRecipient,
            _1 => true
          )
        );
      }
      return fromEither(right(true));
    })
    .chain(_ =>
      profileModel
        .findLastVersionByModelId([fiscalCode])
        .mapLeft(error =>
          ResponseErrorQuery("Error while retrieving the profile", error)
        )
    )
    .chain(
      fromPredicate<IResponseErrorNotFound, Some<RetrievedProfile>>(
        maybeProfile =>
          isSome(maybeProfile) && maybeProfile.value.isInboxEnabled,
        _ =>
          ResponseErrorNotFound(
            "Profile not found",
            "The profile you requested was not found in the system."
          )
      )
    )
    .map(maybeProfile => maybeProfile.value)
    .chain(profile =>
      handleAll()(
        profile,
        servicesPreferencesModel,
        userAttributes.service.serviceId
      )
    )
    .fold<IGetLimitedProfileResponses>(identity, ResponseSuccessJson);
