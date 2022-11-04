#!/bin/bash

# Setup
yarn install --frozen-lockfile
yarn generate-env

# Start Cosmos
yarn start azure-cosmosdb-linux-emulator

# Wait for Cosmos to setup
echo -n "CosmosDB starting..."
cosmos_started=$(docker logs azure-cosmosdb-linux-emulator | grep -wc Started)
echo "---> $cosmos_started"
while [ "$cosmos_started" != "12" ]
do
    sleep 5
    echo -n "."
    cosmos_started=$(docker logs azure-cosmosdb-linux-emulator | grep -wc Started)
    echo "-----> $cosmos_started"
done
echo "CosmosDB Started"

# Start other containers
yarn start function testagent

echo "Env Started"