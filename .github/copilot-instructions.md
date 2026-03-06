# Project Guidelines for AI Coding Agents

This file gives concise, actionable guidance for AI agents working in this repository.

## Code Style

- Language: TypeScript (Node 22+), ESM modules. See [package.json](package.json).
- Formatting: follow `prettier` and `eslint` rules; check [apps/io-functions-services/eslint.config.mjs](apps/io-functions-services/eslint.config.mjs) and root `prettier` config via `package.json` devDeps.
- Type declarations and generated models live under `generated/definitions` — do not manually edit generated files.

## Architecture

- Monorepo with workspace packages under `apps/` and `packages/`.
- The `apps/io-functions-services` application implements Azure Functions (durable orchestrators + activities). See [apps/io-functions-services/README.md](apps/io-functions-services/README.md) for component descriptions.
- Handlers and function entries are organized per-function in the `apps/io-functions-services` folder. Prefer small, testable functions and reuse `clients/` and `utils/` modules.

## Build and Test

- Install deps: `yarn install` (root). This repo uses Yarn v4 workspaces and `turbo`.
- Build: `yarn build` (root) — esegue la build tramite Yarn (per una singola workspace usa ad esempio `yarn workspace io-functions-services build`).
- Run the functions app locally: `cd apps/io-functions-services && yarn start` (see the app README for local.settings.json).
- Tests and lint: `yarn test`, `yarn lint` (run from root via Yarn; per-package example: `yarn workspace io-functions-services test`).

## Integration Tests

Integration tests live in `apps/io-functions-services/__integrations__/` and run against a fully local stack (CosmosDB emulator + Azurite + the Azure Functions app) orchestrated via Docker Compose.

### Setup and run

```bash
cd apps/io-functions-services/__integrations__
cp environments/env.base environments/.env
yarn install
yarn generate:models:services   # generates TypeScript models from OpenAPI specs; required before running tests
yarn start   # build Docker images + start all containers (CosmosDB, Azurite, fixtures, function app)
yarn test    # generate models, codegen, then run Vitest
yarn stop    # tear down all containers
```

### Notes

- No real secrets are required — `env.base` contains dummy keys for the local emulators.
- The test runner polls `GET /api/info` until the function app is healthy before starting tests.
- Currently covers: `GetLimitedProfile` (GET `/api/v1/profiles/{fiscalcode}`) and `GetLimitedProfileByPOST` (POST `/api/v1/profiles`).
- To add integration tests for new functions, add scenarios in `__integrations__/index.test.ts`.

## Project Conventions

- Generated artifacts: `generated/definitions` and OpenAPI files are authoritative; regenerate rather than edit in place.
- Environment: local runtime uses `local.settings.json` (per `apps/io-functions-services/README.md`). Do not commit secrets — use `.env` or CI secret storage.
- Use existing helper modules in `clients/` and `utils/` for external integrations; adding new shared utilities belongs in `packages/` when reusable across apps.

## Integration Points

- Azure Functions runtime, CosmosDB, Blob storage, and queue services. See `apps/io-functions-services/README.md` env examples for connection keys and container names.
- CI: changesets and `turbo` are used for versioning and multi-package builds (see `package.json` scripts).

## Security

- Avoid committing secrets; local runtime uses `local.settings.json` which must contain placeholder values only.
- When adding new secret scopes or environment keys, update CI/CD secret configuration and document required keys in `apps/io-functions-services/README.md`.

If anything here is unclear or you'd like more workspace-specific guidance (examples of typical PRs, preferred testing patterns, or CI steps), tell me which area to expand.
