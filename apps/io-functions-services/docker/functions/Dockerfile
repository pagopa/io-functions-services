FROM functions-node-22

# Install from monorepo root so local workspace packages (e.g. @pagopa/typescript-config-node) are resolved
WORKDIR /repo

COPY .yarn ./.yarn
COPY .yarnrc.yml yarn.lock package.json turbo.json ./
COPY packages/ ./packages/
COPY apps/io-functions-services/ ./apps/io-functions-services/
COPY apps/io-functions-services/__integrations__/__mocks__/ ./apps/io-functions-services/

RUN yarn install --frozen-lockfile

WORKDIR /repo/apps/io-functions-services

RUN func extensions install

RUN yarn build

ENV AzureWebJobsScriptRoot=/repo/apps/io-functions-services \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

CMD ["func", "start", "--javascript"]
