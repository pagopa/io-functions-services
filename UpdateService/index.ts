import { Context } from "@azure/functions";
import * as cors from "cors";
import * as express from "express";

import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "@pagopa/io-functions-commons/dist/src/models/service";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";
import {
  SubscriptionCIDRsModel,
  SUBSCRIPTION_CIDRS_COLLECTION_NAME
} from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
import { cosmosdbInstance } from "../utils/cosmosdb";

import { apiClient } from "../clients/admin";
import { initTelemetryClient } from "../utils/appinsights";
import { getConfigOrThrow } from "../utils/config";
import { UpdateService } from "./handler";

const config = getConfigOrThrow();

// Setup Express
const app = express();
secureExpressApp(app);

// Set up CORS (free access to the API from browser clients)
app.use(cors());

const serviceModel = new ServiceModel(
  cosmosdbInstance.container(SERVICE_COLLECTION_NAME)
);

const subscriptionCIDRsModel = new SubscriptionCIDRsModel(
  cosmosdbInstance.container(SUBSCRIPTION_CIDRS_COLLECTION_NAME)
);

const telemetryClient = initTelemetryClient(
  config.APPINSIGHTS_INSTRUMENTATIONKEY
);

app.put(
  "/api/v1/services/:service_id",
  UpdateService(
    telemetryClient,
    serviceModel,
    apiClient,
    subscriptionCIDRsModel
  )
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function httpStart(context: Context): void {
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
