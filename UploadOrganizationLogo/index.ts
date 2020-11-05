import { Context } from "@azure/functions";
import * as express from "express";
import { cosmosdbInstance } from "../utils/cosmosdb";

import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "io-functions-commons/dist/src/models/service";
import { secureExpressApp } from "io-functions-commons/dist/src/utils/express";
import { setAppContext } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { apiClient } from "../clients/admin";
import { UploadOrganizationLogo } from "./handler";

// Setup Express
const app = express();
secureExpressApp(app);

const serviceModel = new ServiceModel(
  cosmosdbInstance.container(SERVICE_COLLECTION_NAME)
);

app.put(
  "/api/v1/organizations/:organization_fiscal_code/logo",
  UploadOrganizationLogo(serviceModel, apiClient)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
