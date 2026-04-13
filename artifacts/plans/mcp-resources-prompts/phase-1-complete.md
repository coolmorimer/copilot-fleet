# Phase 1 Complete — MCP Resources And Prompts

## Changes Made

| File | Change | Description |
| --- | --- | --- |
| packages/mcp/src/index.ts | Added | Added public barrel exports for MCP resource and prompt registries |
| packages/mcp/src/state.d.ts | Added | Added temporary state contract declarations used by the new resource modules |
| packages/mcp/src/resources/index.ts | Added | Added resource registry barrel wiring session, agent, and provider resources |
| packages/mcp/src/resources/sessions.ts | Added | Added static and dynamic session resources with empty and not-found handling |
| packages/mcp/src/resources/agents.ts | Added | Added static agents resource backed by the Fleet agent registry |
| packages/mcp/src/resources/providers.ts | Added | Added provider metadata resource and builtin template resource |
| packages/mcp/src/prompts/index.ts | Added | Added prompt registry barrel |
| packages/mcp/src/prompts/orchestrate.ts | Added | Added orchestration prompt template for launching Fleet work |
| packages/mcp/src/prompts/decompose.ts | Added | Added task decomposition prompt template |

## Test Results

| Command | Result | Notes |
| --- | --- | --- |
| pnpm --filter @copilot-fleet/mcp-server run typecheck | PASS | TypeScript strict mode passes with the new MCP resources and prompts |
| pnpm --filter @copilot-fleet/mcp-server run build | PASS | Package build succeeds and emits dist output |

## Residual Risks

- The runtime implementation of packages/mcp/src/state.ts is not present yet, so a declaration file is used to keep this phase isolated and type-safe.
- Provider model lists are static snapshots derived from provider implementations and may need refresh if provider defaults change.

## Next Phase Preview

- Wire these registries into the MCP server bootstrap once the runtime state implementation lands.
- Add package-level tests around resource payloads and prompt generation when a test harness is introduced for the mcp package.