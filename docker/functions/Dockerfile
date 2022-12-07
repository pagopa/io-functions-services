### Build with node
FROM node:14.16.0-slim@sha256:7ff9cf5e411481ee734479637265f063c5f356f496d0f9c47112312cb7b46d42 as node-builder

COPY . /home/node

WORKDIR /home/node

# Danger can requires git
# RUN apt-get update && apt-get install git -y

RUN yarn install --frozen-lockfile

RUN yarn build

### Install dotnet extensions
# dotnet core sdk tag list:
# - https://hub.docker.com/_/microsoft-dotnet-sdk/
# - https://mcr.microsoft.com/v2/dotnet/sdk/tags/list
FROM mcr.microsoft.com/dotnet/sdk:3.1.422-alpine3.16@sha256:715916c8d1c479d3450fce05791fbfa4380116661222bfd187a83510254227c2 as dotnet-builder

COPY . /home/node

WORKDIR /home/node

RUN dotnet build -o bin

### Copy files from builders in the final image
# functions base full tag list:
# - https://hub.docker.com/_/microsoft-azure-functions-base
# - https://mcr.microsoft.com/v2/azure-functions/base/tags/list
# functions for node full tag list:
# - https://hub.docker.com/_/microsoft-azure-functions-node
# - https://mcr.microsoft.com/v2/azure-functions/node/tags/list
FROM mcr.microsoft.com/azure-functions/node:4.9.1-node14-slim@sha256:b5bfb82aa0c3b1a81eca8a6899b463c2bd5fa24fb5557f332a5fea4a2687ffe9

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

COPY --from=node-builder /home/node /home/site/wwwroot

COPY --from=dotnet-builder /home/node/bin /home/site/wwwroot/bin

COPY --from=dotnet-builder /home/node/obj /home/site/wwwroot/obj
