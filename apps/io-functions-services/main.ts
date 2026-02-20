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
  methods: ["POST"],
  authLevel: "function",
  route: "v1/services",
  handler: CreateService(telemetryClient, apiClient)(
    config.DEFAULT_SUBSCRIPTION_PRODUCT_NAME,
    config.SANDBOX_FISCAL_CODE,
    serviceModel,
    subscriptionCIDRsModel
  )
});

app.http("GetLimitedProfile", {
  methods: ["GET"],
  authLevel: "function",
  route: "v1/profiles/{fiscalCode}",
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
  )
});

app.http("GetLimitedProfileByPOST", {
  methods: ["POST"],
  authLevel: "function",
  route: "v1/profiles",
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
  )
});

app.http("GetService", {
  methods: ["GET"],
  authLevel: "function",
  route: "v1/services/{service_id}",
  handler: GetService(serviceModel, apiClient)
});

app.http("GetServiceActivation", {
  methods: ["POST"],
  authLevel: "function",
  route: "v1/activations",
  handler: GetServiceActivation(serviceModel, activationModel)
});

app.http("GetSubscriptionsFeed", {
  methods: ["GET"],
  authLevel: "function",
  route: "v1/subscriptions-feed/{date}",
  handler: GetSubscriptionsFeed(
    serviceModel,
    tableService,
    config.SUBSCRIPTIONS_FEED_TABLE,
    config.FF_DISABLE_INCOMPLETE_SERVICES,
    config.FF_INCOMPLETE_SERVICE_WHITELIST
  )
});

app.http("GetUserServices", {
  methods: ["GET"],
  authLevel: "function",
  route: "v1/services",
  handler: GetUserServices(serviceModel, apiClient)
});

app.http("Info", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "info",
  handler: Info()
});

app.http("RegenerateServiceKey", {
  methods: ["PUT"],
  authLevel: "function",
  route: "v1/services/{service_id}/keys",
  handler: RegenerateServiceKey(serviceModel, apiClient, subscriptionCIDRsModel)
});

app.http("UpdateService", {
  methods: ["PUT"],
  authLevel: "function",
  route: "v1/services/{service_id}",
  handler: UpdateService(
    telemetryClient,
    serviceModel,
    apiClient,
    subscriptionCIDRsModel
  )
});

app.http("UploadOrganizationLogo", {
  methods: ["PUT"],
  authLevel: "function",
  route: "v1/organizations/{organization_fiscal_code}/logo",
  handler: UploadOrganizationLogo(serviceModel, apiClient)
});

app.http("UploadServiceLogo", {
  methods: ["PUT"],
  authLevel: "function",
  route: "v1/services/{service_id}/logo",
  handler: UploadServiceLogo(serviceModel, apiClient, subscriptionCIDRsModel)
});

app.http("UpsertServiceActivation", {
  methods: ["PUT"],
  authLevel: "function",
  route: "v1/activations",
  handler: UpsertServiceActivation(serviceModel, activationModel)
});
