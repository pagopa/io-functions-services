# IO Functions for Services

This project implements the APIs called by the 3rd party services.
The implementation is based on the Azure Functions v2 runtime.

## Architecture

The project exposes the following Azure Functions:

| Function                 | Method | Route                                              | Description                                                                                       |
|--------------------------|--------|----------------------------------------------------|---------------------------------------------------------------------------------------------------|
| **Info**                 | GET    | `/api/info`                                        | Health-check endpoint; probes CosmosDB, three Azure Storage connections, and the downstream sending function API. Returns app name + version. |
| **CreateService**        | POST   | `/api/v1/services`                                 | Creates a new service: validates subscription ownership, provisions it via the Admin API, writes a `Service` document to CosmosDB and a `SubscriptionCIDRs` entry. |
| **GetService**           | GET    | `/api/v1/services/{service_id}`                    | Returns a service document from CosmosDB merged with its subscription keys from the Admin API. Enforces service-owner check. |
| **UpdateService**        | PUT    | `/api/v1/services/{service_id}`                    | Updates a service document. Supports standard and special service categories. Owner + manage-key checks. |
| **GetUserServices**      | GET    | `/api/v1/services`                                 | Lists all service IDs owned by the calling user, delegating to the Admin API for the subscription list. |
| **GetLimitedProfile**    | GET    | `/api/v1/profiles/{fiscalcode}`                    | Returns a `LimitedProfile` (with `sender_allowed` flag) for a citizen fiscal code. Applies service-preference mode (LEGACY / AUTO / MANUAL) and special-service activation grace-period logic. |
| **GetLimitedProfileByPOST** | POST | `/api/v1/profiles`                               | Identical logic to `GetLimitedProfile` but accepts the fiscal code in the request body (`FiscalCodePayload`). |
| **GetServiceActivation** | POST   | `/api/v1/activations`                              | Returns the current `Activation` document for a special service, given a fiscal code in the body. Restricted to special-service callers. |
| **UpsertServiceActivation** | PUT | `/api/v1/activations`                             | Creates or updates a special-service `Activation` record for a citizen. Restricted to special-service callers. |
| **GetSubscriptionsFeed** | GET    | `/api/v1/subscriptions-feed/{date}`                | Returns the daily subscriptions/unsubscriptions feed for a service from Azure Table Storage. |
| **RegenerateServiceKey** | PUT    | `/api/v1/services/{service_id}/keys`               | Regenerates the primary or secondary subscription key for a service via the Admin API. Owner + manage-key checks. |
| **UploadServiceLogo**    | PUT    | `/api/v1/services/{service_id}/logo`               | Uploads a base64-encoded logo for a service via the Admin API. Owner + manage-key checks. |
| **UploadOrganizationLogo** | PUT  | `/api/v1/organizations/{organization_fiscal_code}/logo` | Uploads a base64-encoded logo for an organization via the Admin API. |

## Contributing

### Setup

Install the [Azure Functions Core Tools](https://github.com/Azure/azure-functions-core-tools).

Install the dependencies:

```bash
yarn install
```

Create a file `local.settings.json` in your cloned repo, with the
following contents:

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "WEBSITE_NODE_DEFAULT_VERSION": "10.14.1",
    "AzureWebJobsStorage": "<JOBS_STORAGE_CONNECTION_STRING>",
    "APPINSIGHTS_INSTRUMENTATIONKEY": "<APPINSIGHTS_KEY>",
    "MESSAGE_CONTAINER_NAME": "message-content",
    "COSMOSDB_NAME": "<COSMOSDB_DB_NAME>",
    "COSMOSDB_KEY": "<COSMOSDB_KEY>",
    "COSMOSDB_URI": "<COSMOSDB_URI>",
    "WEBHOOK_CHANNEL_URL": "<WEBHOOK_URL>",
    "MAILUP_USERNAME": "<MAILUP_USERNAME>",
    "MAILUP_SECRET": "<MAILUP_PASSWORD>",
    "MAIL_FROM_DEFAULT": "IO - l’app dei servizi pubblici <no-reply@io.italia.it>",
    "QueueStorageConnection": "<QUEUES_STORAGE_CONNECTION_STRING>",
    "SUBSCRIPTIONS_FEED_TABLE": "SubscriptionsFeedByDay"
  },
  "ConnectionStrings": {}
}
```

### Starting the functions runtime

```bash
yarn start
```

The server should reload automatically when the code changes.

## Run Integration Tests locally

```bash
cd __integrations__
cp environments/env.base environments/.env
yarn install                    # only needed the first time
yarn generate:models:services   # generates TypeScript models from OpenAPI specs; required before running tests
yarn start                      # builds Docker images and starts all containers
yarn test                       # runs the Vitest integration test suite
```

To stop and remove all containers:

```bash
yarn stop
```
