import { Context } from "@azure/functions";
import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";
import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "@pagopa/io-functions-commons/dist/src/models/service";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { createTableService } from "azure-storage";
import cors from "cors";
import express from "express";

import { getConfigOrThrow } from "../utils/config";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { GetSubscriptionsFeed } from "./handler";

const config = getConfigOrThrow();

// Setup Express
const app = express();
secureExpressApp(app);

// Set up CORS (free access to the API from browser clients)
app.use(cors());

const serviceModel = new ServiceModel(
  cosmosdbInstance.container(SERVICE_COLLECTION_NAME)
);

const tableService = createTableService(
  config.SUBSCRIPTION_FEED_STORAGE_CONNECTION_STRING
);

app.get(
  "/api/v1/subscriptions-feed/:date",
  GetSubscriptionsFeed(
    serviceModel,
    tableService,
    config.SUBSCRIPTIONS_FEED_TABLE,
    config.FF_DISABLE_INCOMPLETE_SERVICES,
    config.FF_INCOMPLETE_SERVICE_WHITELIST
  )
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
