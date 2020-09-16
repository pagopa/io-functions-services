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

import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { getApiClient } from "../utils/apiclient";
import { CreateService } from "./handler";

// Setup Express
const app = express();
secureExpressApp(app);

// Set up CORS (free access to the API from browser clients)
app.use(cors());

const client = getApiClient();

const productName = getRequiredStringEnv("DEFAULT_SUBSCRIPTION_PRODUCT_NAME");
const sandboxFiscalCode = getRequiredStringEnv("SANDBOX_FISCAL_CODE");

const serviceModel = new ServiceModel(
  cosmosdbInstance.container(SERVICE_COLLECTION_NAME)
);

app.post(
  "/api/v1/services",
  CreateService(serviceModel, client, productName, sandboxFiscalCode)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
