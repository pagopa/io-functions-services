#!/bin/bash

yarn install --frozen-lockfile
yarn generate-env

yarn start azure-cosmosdb-linux-emulator

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

yarn start fixtures function testagent

echo "Env Started"