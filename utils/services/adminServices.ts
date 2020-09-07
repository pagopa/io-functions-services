import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { EmailString, NonEmptyString } from "italia-ts-commons/lib/strings";
import { ProductNamePayload } from "../../generated/api-admin/ProductNamePayload";
import { Service } from "../../generated/api-admin/Service";
import { Subscription } from "../../generated/api-admin/Subscription";
import { SubscriptionKeys } from "../../generated/api-admin/SubscriptionKeys";
import { SubscriptionKeyTypePayload } from "../../generated/api-admin/SubscriptionKeyTypePayload";
import { UserInfo } from "../../generated/api-admin/UserInfo";
import { ServiceId } from "../../generated/definitions/ServiceId";
import {
  IResponseErrorUnauthorized,
  ResponseErrorUnauthorized,
  unhandledResponseStatus,
  withCatchAsInternalError,
  withValidatedOrInternalError
} from "../responses";
import { IApiClientFactoryInterface } from "./IApiClientFactory";

export default class AdminService {
  constructor(private readonly apiClient: IApiClientFactoryInterface) {}

  /**
   * Retrieve a Service by given serviceId
   * @param serviceId : the service identifier used to retrieve a Service
   */
  public readonly getService = (
    serviceId: ServiceId
  ): Promise<
    // tslint:disable-next-line:max-union-size
    | IResponseErrorInternal
    | IResponseErrorNotFound
    | IResponseSuccessJson<Service>
  > => {
    const client = this.apiClient.getClient();
    return withCatchAsInternalError(async () => {
      const validated = await client.getService({
        service_id: serviceId
      });
      return withValidatedOrInternalError(validated, response => {
        if (response.status === 200) {
          const validatedService = Service.decode(response.value);

          return withValidatedOrInternalError(validatedService, userService =>
            ResponseSuccessJson(userService)
          );
        }

        if (response.status === 404) {
          return ResponseErrorNotFound("Not Found", "Service not found");
        }

        return unhandledResponseStatus(response.status);
      });
    });
  };

  /**
   * Returns a set of User related informations (i.e: the set of active subscriptions),
   * by providing its email
   * @param email : the user email
   */
  public readonly getUser = (
    email: EmailString
  ): Promise<
    // tslint:disable-next-line:max-union-size
    | IResponseErrorInternal
    | IResponseErrorNotFound
    | IResponseSuccessJson<UserInfo>
  > => {
    const client = this.apiClient.getClient();
    return withCatchAsInternalError(async () => {
      const validated = await client.getUser({
        email
      });
      return withValidatedOrInternalError(validated, response => {
        if (response.status === 200) {
          const validatedUserInfo = UserInfo.decode(response.value);

          return withValidatedOrInternalError(validatedUserInfo, userInfo =>
            ResponseSuccessJson(userInfo)
          );
        }

        if (response.status === 404) {
          return ResponseErrorNotFound("Not Found", "User not found");
        }

        return unhandledResponseStatus(response.status);
      });
    });
  };

  /**
   * Creates a new user's service
   * @param service : The service to be created
   */
  public readonly createService = (
    service: Service
  ): Promise<
    // tslint:disable-next-line:max-union-size
    | IResponseErrorInternal
    | IResponseErrorUnauthorized
    | IResponseSuccessJson<Service>
  > => {
    const client = this.apiClient.getClient();
    return withCatchAsInternalError(async () => {
      const validated = await client.createService({
        service
      });
      return withValidatedOrInternalError(validated, response => {
        if (response.status === 200) {
          const validatedCreatedService = Service.decode(response.value);

          return withValidatedOrInternalError(
            validatedCreatedService,
            userService => ResponseSuccessJson(userService)
          );
        }

        if (response.status === 401) {
          return ResponseErrorUnauthorized("Unauthorized", "Unauthorized");
        }
      });
    });
  };

  /**
   * Creates a new subscription for a user service
   * @param email: User's email
   * @param subscriptionId: The subscriptionId related to a new subscription
   * @param productNamePayload: The product name related to a new subscription
   */
  public readonly createSubscription = (
    email: EmailString,
    subscriptionId: ServiceId,
    productNamePayload: ProductNamePayload
  ): Promise<
    // tslint:disable-next-line:max-union-size
    | IResponseErrorInternal
    | IResponseErrorForbiddenNotAuthorized
    | IResponseErrorNotFound
    | IResponseSuccessJson<Subscription>
  > => {
    const client = this.apiClient.getClient();
    return withCatchAsInternalError(async () => {
      const validated = await client.createSubscription({
        email,
        productNamePayload,
        subscription_id: subscriptionId
      });
      return withValidatedOrInternalError(validated, response => {
        if (response.status === 200) {
          const validatedSubscription = Subscription.decode(response.value);

          return withValidatedOrInternalError(
            validatedSubscription,
            subscription => ResponseSuccessJson(subscription)
          );
        }

        if (response.status === 403) {
          return ResponseErrorForbiddenNotAuthorized;
        }

        if (response.status === 404) {
          return ResponseErrorNotFound(
            "Not Found",
            "Resource (User or Product) not found"
          );
        }
      });
    });
  };

  /**
   * Updates an existing user's service.
   * @param service: the service to be updated
   */
  public readonly updateService = (
    service: Service
  ): Promise<
    // tslint:disable-next-line:max-union-size
    | IResponseErrorInternal
    | IResponseErrorNotFound
    | IResponseErrorUnauthorized
    | IResponseSuccessJson<Service>
  > => {
    const client = this.apiClient.getClient();
    return withCatchAsInternalError(async () => {
      const validated = await client.updateService({
        service,
        service_id: service.service_id
      });
      return withValidatedOrInternalError(validated, response => {
        if (response.status === 200) {
          const validatedUpdatedService = Service.decode(response.value);

          return withValidatedOrInternalError(
            validatedUpdatedService,
            userService => ResponseSuccessJson(userService)
          );
        }

        if (response.status === 401) {
          return ResponseErrorUnauthorized("Unauthorized", "Unauthorized");
        }

        if (response.status === 404) {
          return ResponseErrorNotFound(
            "Not Found",
            "Service not found for the provided id"
          );
        }
      });
    });
  };

  /**
   * Uploads a user's service logo
   * @param serviceId: the identifier of the service
   * @param logo: the Base64 representation of a logo image
   */
  public readonly uploadServiceLogo = (
    serviceId: ServiceId,
    logo: NonEmptyString
  ): Promise<
    // tslint:disable-next-line:max-union-size
    | IResponseErrorInternal
    | IResponseErrorNotFound
    | IResponseErrorUnauthorized
    | IResponseErrorForbiddenNotAuthorized
    | IResponseSuccessJson<string>
  > => {
    const client = this.apiClient.getClient();
    return withCatchAsInternalError(async () => {
      const validated = await client.uploadServiceLogo({
        logo: {
          logo
        },
        service_id: serviceId
      });
      return withValidatedOrInternalError(validated, response => {
        if (response.status === 201) {
          return ResponseSuccessJson("Logo uploaded");
        }

        if (response.status === 401) {
          return ResponseErrorUnauthorized("Unauthorized", "Unauthorized");
        }

        if (response.status === 403) {
          return ResponseErrorForbiddenNotAuthorized;
        }

        if (response.status === 404) {
          return ResponseErrorNotFound(
            "Not Found",
            "Service not found for the provided id"
          );
        }
      });
    });
  };

  /**
   * Regenerates a subscription keys for a given service id
   * @param serviceId: The identifier of the target service
   * @param subscriptionKeyTypePayload: the type of subscription key to be regenerated
   */
  public readonly regenerateSubscriptionKey = (
    serviceId: ServiceId,
    subscriptionKeyTypePayload: SubscriptionKeyTypePayload
  ): Promise<
    // tslint:disable-next-line:max-union-size
    | IResponseErrorInternal
    | IResponseErrorNotFound
    | IResponseErrorForbiddenNotAuthorized
    | IResponseSuccessJson<SubscriptionKeys>
  > => {
    const client = this.apiClient.getClient();
    return withCatchAsInternalError(async () => {
      const validated = await client.RegenerateSubscriptionKeys({
        service_id: serviceId,
        subscriptionKeyTypePayload
      });
      return withValidatedOrInternalError(validated, response => {
        if (response.status === 200) {
          const validatedSubscriptionKeys = SubscriptionKeys.decode(
            response.value
          );

          return withValidatedOrInternalError(
            validatedSubscriptionKeys,
            subscriptionKeys => ResponseSuccessJson(subscriptionKeys)
          );
        }

        if (response.status === 403) {
          return ResponseErrorForbiddenNotAuthorized;
        }

        if (response.status === 404) {
          return ResponseErrorNotFound("Not Found", "Subscription not found");
        }
      });
    });
  };
}
