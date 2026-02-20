import { app } from "@azure/functions";
import {
  ACTIVATION_COLLECTION_NAME,
  ActivationModel
} from "@pagopa/io-functions-commons/dist/src/models/activation";
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  SERVICE_PREFERENCES_COLLECTION_NAME,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import {
  SUBSCRIPTION_CIDRS_COLLECTION_NAME,
  SubscriptionCIDRsModel
} from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
import { Second } from "@pagopa/ts-commons/lib/units";
import { createTableService } from "azure-storage";

import { apiClient } from "./clients/admin";
import { CreateService } from "./CreateService/handler";
import { GetLimitedProfile } from "./GetLimitedProfile/handler";
import { GetLimitedProfileByPOST } from "./GetLimitedProfileByPOST/handler";
import { GetService } from "./GetService/handler";
import { GetServiceActivation } from "./GetServiceActivation/handler";
import { GetSubscriptionsFeed } from "./GetSubscriptionsFeed/handler";
import { GetUserServices } from "./GetUserServices/handler";
import { Info } from "./Info/handler";
import { RegenerateServiceKey } from "./RegenerateServiceKey/handler";
import { UpdateService } from "./UpdateService/handler";
import { UploadOrganizationLogo } from "./UploadOrganizationLogo/handler";
import { UploadServiceLogo } from "./UploadServiceLogo/handler";
import { UpsertServiceActivation } from "./UpsertServiceActivation/handler";
import { initTelemetryClient } from "./utils/appinsights";
import { getConfigOrThrow } from "./utils/config";
import { cosmosdbInstance } from "./utils/cosmosdb";
import { canSendMessageOnActivationWithGrace } from "./utils/services";

const config = getConfigOrThrow();

const telemetryClient = initTelemetryClient(
  config.APPINSIGHTS_INSTRUMENTATIONKEY
);

const serviceModel = new ServiceModel(
  cosmosdbInstance.container(SERVICE_COLLECTION_NAME)
);

const profileModel = new ProfileModel(
  cosmosdbInstance.container(PROFILE_COLLECTION_NAME)
);

const activationModel = new ActivationModel(
  cosmosdbInstance.container(ACTIVATION_COLLECTION_NAME)
);

const servicesPreferencesModel = new ServicesPreferencesModel(
  cosmosdbInstance.container(SERVICE_PREFERENCES_COLLECTION_NAME),
  SERVICE_PREFERENCES_COLLECTION_NAME
);

const subscriptionCIDRsModel = new SubscriptionCIDRsModel(
  cosmosdbInstance.container(SUBSCRIPTION_CIDRS_COLLECTION_NAME)
);

const tableService = createTableService(
  config.SUBSCRIPTION_FEED_STORAGE_CONNECTION_STRING
);

// Register HTTP triggers

app.http("CreateService", {
  authLevel: "function",
  handler: CreateService(telemetryClient, apiClient)(
    config.DEFAULT_SUBSCRIPTION_PRODUCT_NAME,
    config.SANDBOX_FISCAL_CODE,
    serviceModel,
    subscriptionCIDRsModel
  ),
  methods: ["POST"],
  route: "v1/services"
});

app.http("GetLimitedProfile", {
  authLevel: "function",
  handler: GetLimitedProfile(
    serviceModel,
    profileModel,
    activationModel,
    config.FF_DISABLE_INCOMPLETE_SERVICES,
    config.FF_INCOMPLETE_SERVICE_WHITELIST,
    servicesPreferencesModel,
    canSendMessageOnActivationWithGrace(
      config.PENDING_ACTIVATION_GRACE_PERIOD_SECONDS as Second
    ),
    telemetryClient
  ),
  methods: ["GET"],
  route: "v1/profiles/{fiscalCode}"
});

app.http("GetLimitedProfileByPOST", {
  authLevel: "function",
  handler: GetLimitedProfileByPOST(
    serviceModel,
    profileModel,
    config.FF_DISABLE_INCOMPLETE_SERVICES,
    config.FF_INCOMPLETE_SERVICE_WHITELIST,
    servicesPreferencesModel,
    activationModel,
    canSendMessageOnActivationWithGrace(
      config.PENDING_ACTIVATION_GRACE_PERIOD_SECONDS as Second
    ),
    telemetryClient
  ),
  methods: ["POST"],
  route: "v1/profiles"
});

app.http("GetService", {
  authLevel: "function",
  handler: GetService(serviceModel, apiClient),
  methods: ["GET"],
  route: "v1/services/{service_id}"
});

app.http("GetServiceActivation", {
  authLevel: "function",
  handler: GetServiceActivation(serviceModel, activationModel),
  methods: ["POST"],
  route: "v1/activations"
});

app.http("GetSubscriptionsFeed", {
  authLevel: "function",
  handler: GetSubscriptionsFeed(
    serviceModel,
    tableService,
    config.SUBSCRIPTIONS_FEED_TABLE,
    config.FF_DISABLE_INCOMPLETE_SERVICES,
    config.FF_INCOMPLETE_SERVICE_WHITELIST
  ),
  methods: ["GET"],
  route: "v1/subscriptions-feed/{date}"
});

app.http("GetUserServices", {
  authLevel: "function",
  handler: GetUserServices(serviceModel, apiClient),
  methods: ["GET"],
  route: "v1/services"
});

app.http("Info", {
  authLevel: "anonymous",
  handler: Info(),
  methods: ["GET"],
  route: "info"
});

app.http("RegenerateServiceKey", {
  authLevel: "function",
  handler: RegenerateServiceKey(
    serviceModel,
    apiClient,
    subscriptionCIDRsModel
  ),
  methods: ["PUT"],
  route: "v1/services/{service_id}/keys"
});

app.http("UpdateService", {
  authLevel: "function",
  handler: UpdateService(
    telemetryClient,
    serviceModel,
    apiClient,
    subscriptionCIDRsModel
  ),
  methods: ["PUT"],
  route: "v1/services/{service_id}"
});

app.http("UploadOrganizationLogo", {
  authLevel: "function",
  handler: UploadOrganizationLogo(serviceModel, apiClient),
  methods: ["PUT"],
  route: "v1/organizations/{organization_fiscal_code}/logo"
});

app.http("UploadServiceLogo", {
  authLevel: "function",
  handler: UploadServiceLogo(serviceModel, apiClient, subscriptionCIDRsModel),
  methods: ["PUT"],
  route: "v1/services/{service_id}/logo"
});

app.http("UpsertServiceActivation", {
  authLevel: "function",
  handler: UpsertServiceActivation(serviceModel, activationModel),
  methods: ["PUT"],
  route: "v1/activations"
});
