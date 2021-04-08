import { Context } from "@azure/functions";
import { createTableService } from "azure-storage";

import * as cors from "cors";
import * as express from "express";

import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "@pagopa/io-functions-commons/dist/src/models/service";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { cosmosdbInstance } from "../utils/cosmosdb";

import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { GetSubscriptionsFeed } from "./handler";

import { getConfigOrThrow } from "../utils/config";

const config = getConfigOrThrow();

// Setup Express
const app = express();
secureExpressApp(app);

// Set up CORS (free access to the API from browser clients)
app.use(cors());

const serviceModel = new ServiceModel(
  cosmosdbInstance.container(SERVICE_COLLECTION_NAME)
);

const tableService = createTableService(config.QueueStorageConnection);

app.get(
  "/api/v1/subscriptions-feed/:date",
  GetSubscriptionsFeed(
    serviceModel,
    tableService,
    config.SUBSCRIPTIONS_FEED_TABLE
  )
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
