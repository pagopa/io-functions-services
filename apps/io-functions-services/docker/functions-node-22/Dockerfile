FROM node:22.22.0

WORKDIR /usr/src/app

# Install Azure Functions Core Tools via npm (v4 bundles self-contained .NET runtime)
RUN npm install -g azure-functions-core-tools@4 --unsafe-perm=true --allow-root

ENV AzureWebJobsScriptRoot=/usr/src/app \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

CMD ["func", "start", "--javascript"]
