#!/bin/bash

yarn install --frozen-lockfile
yarn generate-env

yarn start azure-cosmosdb-linux-emulator

echo "Wait Cosmos container to setup"
sleep 15

echo -n "CosmosDB starting..."
cosmos_started=$(docker logs azure-cosmosdb-linux-emulator | grep -wc Started) || "Not started"
echo "---> $cosmos_started"
while [ "$cosmos_started" != "12" ]
do
    sleep 5
    echo -n "."
    cosmos_started=$(docker logs azure-cosmosdb-linux-emulator | grep -wc Started) || "Not started"
    echo "-----> $cosmos_started"
done
echo "CosmosDB Started"

sleep 30
yarn start fixtures function testagent

echo "Env Started"

docker logs fixtures