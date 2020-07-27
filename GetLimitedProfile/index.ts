import { CosmosClient } from "@azure/cosmos";
import { Context } from "@azure/functions";
import cors = require("cors");
import express = require("express");
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "io-functions-commons/dist/src/models/profile";
import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "io-functions-commons/dist/src/models/service";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { secureExpressApp } from "io-functions-commons/dist/src/utils/express";
import { setAppContext } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { GetLimitedProfile } from "./handler";

// Setup Express
const app = express();
secureExpressApp(app);

// Set up CORS (free access to the API from browser clients)
app.use(cors());

// Setup DocumentDB
const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");
const cosmosDbKey = getRequiredStringEnv("COSMOSDB_KEY");

const cosmosdbClient = new CosmosClient({
  endpoint: cosmosDbUri,
  key: cosmosDbKey
});

const serviceModel = new ServiceModel(
  cosmosdbClient.database(cosmosDbName).container(SERVICE_COLLECTION_NAME)
);

const profileModel = new ProfileModel(
  cosmosdbClient.database(cosmosDbName).container(PROFILE_COLLECTION_NAME)
);

app.get(
  "/api/v1/profiles/:fiscalcode",
  GetLimitedProfile(serviceModel, profileModel)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
