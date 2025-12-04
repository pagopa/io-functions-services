import { Context } from "@azure/functions";
import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";
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
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { Second } from "@pagopa/ts-commons/lib/units";
import cors from "cors";
import express from "express";

import { initTelemetryClient } from "../utils/appinsights";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { canSendMessageOnActivationWithGrace } from "../utils/services";
import { GetLimitedProfile } from "./handler";

const config = getConfigOrThrow();
const telemetryClient = initTelemetryClient(
  config.APPINSIGHTS_INSTRUMENTATIONKEY
);

// Setup Express
const app = express();
secureExpressApp(app);

// Set up CORS (free access to the API from browser clients)
app.use(cors());

const serviceModel = new ServiceModel(
  cosmosdbInstance.container(SERVICE_COLLECTION_NAME)
);

const profileModel = new ProfileModel(
  cosmosdbInstance.container(PROFILE_COLLECTION_NAME)
);

const serviceActivationModel = new ActivationModel(
  cosmosdbInstance.container(ACTIVATION_COLLECTION_NAME)
);

const servicesPreferencesModel = new ServicesPreferencesModel(
  cosmosdbInstance.container(SERVICE_PREFERENCES_COLLECTION_NAME),
  SERVICE_PREFERENCES_COLLECTION_NAME
);

app.get(
  "/api/v1/profiles/:fiscalcode",
  GetLimitedProfile(
    serviceModel,
    profileModel,
    serviceActivationModel,
    config.FF_DISABLE_INCOMPLETE_SERVICES,
    config.FF_INCOMPLETE_SERVICE_WHITELIST,
    servicesPreferencesModel,
    canSendMessageOnActivationWithGrace(
      config.PENDING_ACTIVATION_GRACE_PERIOD_SECONDS as Second
    ),
    telemetryClient
  )
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
