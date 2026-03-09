FROM node:22.22.0@sha256:20a424ecd1d2064a44e12fe287bf3dae443aab31dc5e0c0cb6c74bef9c78911c

WORKDIR /usr/src/app

# Install Azure Functions Core Tools via npm (v4 bundles self-contained .NET runtime)
RUN npm install -g azure-functions-core-tools@4 --unsafe-perm=true --allow-root

ENV AzureWebJobsScriptRoot=/usr/src/app \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

CMD ["func", "start", "--javascript"]
