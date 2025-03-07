import { Context } from "@azure/functions";
import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";
import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  SUBSCRIPTION_CIDRS_COLLECTION_NAME,
  SubscriptionCIDRsModel
} from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import * as express from "express";

import { apiClient } from "../clients/admin";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { UploadServiceLogo } from "./handler";

// Setup Express
const app = express();
secureExpressApp(app);

const serviceModel = new ServiceModel(
  cosmosdbInstance.container(SERVICE_COLLECTION_NAME)
);

const subscriptionCIDRsModel = new SubscriptionCIDRsModel(
  cosmosdbInstance.container(SUBSCRIPTION_CIDRS_COLLECTION_NAME)
);

app.put(
  "/api/v1/services/:service_id/logo",
  UploadServiceLogo(serviceModel, apiClient, subscriptionCIDRsModel)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
