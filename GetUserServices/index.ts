import { Context } from "@azure/functions";
import * as cors from "cors";
import * as express from "express";
import { cosmosdbInstance } from "../utils/cosmosdb";

import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "io-functions-commons/dist/src/models/service";
import { secureExpressApp } from "io-functions-commons/dist/src/utils/express";
import { setAppContext } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { getApiClient } from "../utils/apiclient";
import { GetUserServices } from "./handler";

// Setup Express
const app = express();
secureExpressApp(app);

const client = getApiClient();

const serviceModel = new ServiceModel(
  cosmosdbInstance.container(SERVICE_COLLECTION_NAME)
);

// Set up CORS (free access to the API from browser clients)
app.use(cors());

app.get("/api/v1/services", GetUserServices(serviceModel, client));

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;