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

sleep 15

# Start other containers
yarn start fixtures function testagent

# Check fixtures exit code
fixtures_exit_code=$(docker wait fixtures)
echo "fixtures_setup ---> $fixtures_exit_code"

if [ "$fixtures_exit_code" -eq "0" ]; then
echo "Env Started"
else
echo "Fixtures in error."
exit 1;
fi
