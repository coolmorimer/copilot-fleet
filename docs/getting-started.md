---
title: Getting started with CopilotFleet
version: 0.1.0
lastUpdated: 2026-04-13
status: draft
aiAssisted: true
reviewOwners:
  - maintainers
---

# Getting started with CopilotFleet

CopilotFleet is a Visual Agent Orchestration Platform built as a TypeScript monorepo with pnpm workspaces.

## Prerequisites

- Node.js 20+
- pnpm 9+

## Installation

```bash
git clone <your-fork-or-repo-url>
cd copilot-fleet
pnpm install
pnpm build
```

## Quick run

Use the workspace packages directly when embedding CopilotFleet into another app.

```ts
import { FleetEngine } from '@copilot-fleet/core';
import { ProviderRegistry } from '@copilot-fleet/providers';
import { AgentRegistry } from '@copilot-fleet/agents';

const engine = new FleetEngine();
const providers = new ProviderRegistry();
const agents = new AgentRegistry();

agents.loadBuiltins();

// Register provider factories, create providers, and attach them to the engine.
// Then create a FleetGraph and call engine.createSession(...) + engine.run(...).
```

The graph and session contracts are defined in @copilot-fleet/shared. See [architecture.md](./architecture.md) and [graph-format.md](./graph-format.md) for the execution model and graph schema.

## CLI usage

Build the CLI package, then inspect the generated entrypoint:

```bash
pnpm --filter @copilot-fleet/cli run build
node packages/cli/dist/index.js --help
```

Key commands:

```bash
fleet run --task "Refactor auth flow and add tests" --preset squad
fleet serve --port 3847
fleet agents list
fleet templates list
fleet interactive
fleet status
fleet abort
fleet history
fleet providers list
```

Notes:

- `fleet run` accepts either `--task` or a positional task.
- `fleet history` is the current command in this build. There is no `history list` subcommand yet.
- Custom agents are loaded from `.fleet/agents/`.
- Templates are read from [../templates](../templates).

## Web dashboard

```bash
fleet serve --port 3847
```

This starts the CLI placeholder panel at http://localhost:3847.

The full React dashboard lives in [../packages/web](../packages/web). Its onboarding flow walks through:

- provider setup
- starter template selection
- loading an initial graph into the canvas

## VS Code extension

The VS Code extension source is in [../packages/vscode](../packages/vscode).

Install it from that package by building and packaging the extension, then install the generated VSIX in VS Code.

Chat participant:

- `@fleet /run`
- `@fleet /plan`
- `@fleet /status`
- `@fleet /abort`
- `@fleet /graph`
- `@fleet /agents`
- `@fleet /templates`

Extension commands include:

- `copilot-fleet.openGraph`
- `copilot-fleet.run`
- `copilot-fleet.stop`
- `copilot-fleet.status`
- `copilot-fleet.openSidebar`
- `copilot-fleet.loadTemplate`
- `copilot-fleet.listAgents`
- `copilot-fleet.abort`

## MCP server

Configure the MCP server in `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "copilot-fleet": {
      "command": "npx",
      "args": ["@copilot-fleet/mcp-server"]
    }
  }
}
```

Then use these tools from any MCP client:

- `launch_fleet`
- `fleet_status`
- `list_agents`
- `abort_fleet`
- `add_agent`

## Next steps

- Read [architecture.md](./architecture.md)
- Read [graph-format.md](./graph-format.md)
- Plan [creating-agents.md](./creating-agents.md)
- Plan [creating-providers.md](./creating-providers.md)

## Validation

Use these checks after local changes:

```bash
pnpm build
pnpm typecheck
```

Do not commit provider credentials or API keys into the repository.
