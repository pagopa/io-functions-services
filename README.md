# IO Functions for Services

This project implements the APIs called by the 3rd party services.
The implementation is based on the Azure Functions v2 runtime.

## Architecture

The project is structured as follows:

* `CreateMessage`: handles the `createMessage` API, creates a `Message` document and forks the `CreatedMessageOrchestrator` durable function:
  * `CreatedMessageOrchestrator`: handles all the asynchronous activities involving the creation of a message, it calls the following activities:
    * `StoreMessageContentActivity`: stores the content of the message in a blob
    * `MessageStatusUpdaterActivity`: upsates the status of the `Message` document after the content of the message has been successfully stored
    * `CreateNotificationActivity`: creates a `Notification` document
    * `EmailNotificationActivity`: sends an email notification if needed
    * `WebhookNotificationActivity`: triggers a webhook call if needed
    * `NotificationStatusUpdaterActivity`: updates the `Notification` document with the results of the email or webhook notifications.
* `GetMessage`: handles the `getMessage` API for services
* `GetLimitedProfile`: handles the `getProfile` API for services

## Contributing

### Setup

Install the [Azure Functions Core Tools](https://github.com/Azure/azure-functions-core-tools).

Install the dependencies:

```
$ yarn install
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
    "CUSTOMCONNSTR_COSMOSDB_KEY": "<COSMOSDB_KEY>",
    "CUSTOMCONNSTR_COSMOSDB_URI": "<COSMOSDB_URI>",
    "WEBHOOK_CHANNEL_URL": "<WEBHOOK_URL>",
    "MAILUP_USERNAME": "<MAILUP_USERNAME>",
    "MAILUP_SECRET": "<MAILUP_PASSWORD>",
    "MAIL_FROM_DEFAULT": "IO - l’app dei servizi pubblici <no-reply@io.italia.it>",
    "QueueStorageConnection": "<QUEUES_STORAGE_CONNECTION_STRING>"
  },
  "ConnectionStrings": {}
}
```

### Starting the functions runtime

```
$ yarn start
```

The server should reload automatically when the code changes.
