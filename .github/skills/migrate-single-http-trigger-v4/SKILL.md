---
name: migrate-single-http-trigger-v4
description: Automate the migration of a single HTTP Trigger from Azure Functions v3 to v4.
---

# Single HTTP Trigger migration v3 to v4 Migration Sub-skill

## Overview

This skill acts as a Sub-skill to streamline the migration of a single Azure Function HTTP Trigger. Instead of manual refactoring, it performs the necessary steps to identify, migrate, and validate a single HTTP Trigger.

This skill is designed to be called by the `migrate-http-trigger-v4-orchestrator` skill for each identified HTTP Trigger in the codebase.
it expects to receive an object with the following structure:

```json
{
  "functionName": "string", // Identified from the folder name containing the function.json
  "functionJsonPath": "string",
  "handlerPath": "string", // Identified from function.json 'scriptFile'
  "httpConfig": {
    "route": "string",
    "methods": ["string"],
    "authLevel": "string"
  }
}
```

---

### 1. Refactor Phase

- The context are the handler file identified in the input object as `handlerPath`, and its imports.
- Find the wrapper function, which is the function mounted to the express app. It's usually a functions that returns an `express.RequestHandler` and wraps the actual handler with the `wrapRequestHandler` function from `@pagopa/express-azure-functions`. It also mount the middlewares, if present. We call this function the "wrapper Function".
- Update the wrapper function to be compatible with Azure Functions v4, by following these steps:
  - Import the new `wrapHandlerV4` function from `@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter`
  - Remove the import of `wrapRequestHandler` from `@pagopa/express-azure-functions`.
  - If middlewares are used, refactor them to become an array, to be passed to the new `wrapHandlerV4` function. The array should be typed as `const` to preserve the literal types of the middlewares.
  - Replace the existing `wrapRequestHandler` with `wrapHandlerV4` to adapt to v4's native HTTP handling, and add the middlewares array as first parameter.
  - Modify the signature by removing `express.RequestHandler` response type.
  - If present, update the import of `Context` from `@azure/functions` to `InvocationContext` from `@azure/functions`.
  - If `context.` is used, replace it by removing `.log`, as in v4 the `InvocationContext` itself is a logger.
- Mount the handler in main.ts by following the Azure Functions v4 conventions and the `httpConfig` values. The convention is the following:

```typescript
app.http({{functionName}}, {
  methods: [{{httpConfig.methods}}],
  authLevel: "anonymous",
  route: "{{httpConfig.route}}",
  handler: {{wrapperFunctionName}}(),
});
```

- If the handler needs any dependencies, ensure they are properly injected, checking the route defined in the function.json file. Set the dependencies at the top of the main file, if they are not already defined, and pass them to the wrapper function as parameters.
- Search handler tests, if present, and update Context mock to InvocationContext mock:
  - Update the import of `Context` from `@azure/functions` to `InvocationContext` from `@azure/functions`.
  - Update the mock context object to match the structure of `InvocationContext`, ensuring that logging methods are properly mocked.

### 2. Cleanup Phase

- Delete `index.ts` file if present, as v4 does not require it for exports.
- Delete `functions.json` file if present, as v4 does not require it for exports.
- Clean up any remaining v3-specific code patterns in the handler file, such as express-specific code or v3 middleware patterns.

---
