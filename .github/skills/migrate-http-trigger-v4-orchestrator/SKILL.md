---
name: migrate-http-trigger-v4-orchestrator
description: Automate the migration of HTTP Triggers from Azure Functions v3 to v4.
---

# Azure Functions v3 to v4 Migration Orchestrator

## Overview

This skill acts as a **Master Controller** to streamline the migration of Azure Functions. Instead of manual refactoring, it coordinates specialized sub-skills to identify, migrate, and validate HTTP Triggers.

---

## Workflow Orchestration

Follow the phases below to orchestrate the migration process. Progress on orderly, ensuring that each phase is completed before moving to the next.:

### 1. Setup Phase

- Upgrade `@azure/functions` dependency to v4 in the `package.json` file.
- move `@azure/functions` from devDependencies to dependencies, when necessary.
- Upgrade `@pagopa/io-functions-commons` to v30.0.0
- Remove `express` and `@pagopa/express-azure-functions` dependency if present, as v4 supports native HTTP handling.
- Remove all winston related dependencies, if present.
- Run install script to update the lock file with the new dependencies.
- Upgrade extension bundle to "[4.0.0, 5.0.0)" in `host.json` file, if necessary.
- Create empty `main.ts` file, if not already present, to serve as the entry point for the migrated triggers.

### 2. Discovery Phase

- Scan the repository for all instances of `function.json` files to identify all legacy triggers.
- Exclude any triggers that are not of type `httpTrigger`.
- For each HTTP trigger found, generate an object with:

  ```json
  {
    "functionName": "string", // Identified from the folder name containing the function.json
    "functionJsonPath": "string",
    "handlerPath": "string", // Identified from function.json 'scriptFile'yes
    "httpConfig": {
      "route": "string",
      "methods": ["string"],
      "authLevel": "string"
    }
  }
  ```

### 3. Migration Phase

In this phase, the agent does not perform any migration tasks directly. It is responsible for delegating specific tasks to dedicated sub-skills, after user approval.

- For each identified Http trigger:
  - Call subskill `migrate-single-http-trigger-v4` with the extracted metadata, to perform the migration of the single trigger.
  - Stop and ask for user confirmation before proceeding with the migration of each trigger, providing a summary of the changes that will be made and per percentage of completion.

### 4. Cleanup Phase

- Ensure that the codebase is free of any v3-specific patterns or configurations.

### 5. Validation Phase

- Run automated tests to verify that the migrated triggers function correctly.
- Generate a report summarizing the migration results, including any issues encountered.

---
