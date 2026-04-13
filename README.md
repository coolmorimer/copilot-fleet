# CopilotFleet

![Build Status](https://img.shields.io/badge/build-placeholder-lightgrey)
![npm version](https://img.shields.io/badge/npm-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

Visual Agent Orchestration Platform

CopilotFleet is a TypeScript monorepo for building and running agent-driven workflows as directed acyclic graphs. It separates graph modeling, execution, provider integrations, and agent definitions into focused packages so teams can compose orchestration behavior without coupling every concern into one runtime.

The project is designed around visual workflow concepts such as triggers, agent nodes, splitters, mergers, conditions, and outputs. A graph becomes the contract between planning, execution, and UI layers: the shared package defines the schema, the core package schedules and runs the DAG, the providers package handles LLM backends, and the agents package supplies builtin and custom personas.

The repository ships 8 workspace packages: core orchestration primitives, 7 provider adapters, 10 builtin agents with custom YAML/JSON loading, a React Flow web dashboard, a VS Code extension with Chat Participant `@fleet`, a CLI with 9 commands, and an MCP server for integration with any AI tool via stdio transport.

## Table of contents

- [Quick start](#quick-start)
- [Packages](#packages)
- [Architecture](#architecture)
- [Templates](#templates)
- [Configuration](#configuration)
- [CLI](#cli)
- [Web dashboard](#web-dashboard)
- [VS Code extension](#vs-code-extension)
- [MCP server](#mcp-server)
- [Creating custom agents](#creating-custom-agents)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Quick start

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install

```bash
pnpm install
```

### Configure

Create a runtime config file such as `fleet.config.json` for your host application:

```json
{
  "session": {
    "preset": "squad",
    "maxConcurrency": 3,
    "timeout": 1800000,
    "dryRun": false,
    "locale": "en"
  },
  "providers": {
    "copilot": {
      "type": "github-copilot",
      "name": "copilot",
      "apiKey": "${GITHUB_COPILOT_API_KEY}",
      "models": ["claude-sonnet-4", "gpt-4o"],
      "defaultModel": "claude-sonnet-4"
    }
  },
  "agents": [],
  "locale": "en"
}
```

### Run

Use the repository scripts while developing the platform or embedding it into your own app:

```bash
pnpm build
pnpm typecheck
pnpm dev
```

`pnpm dev` starts TypeScript watch mode across workspace packages.

For a quick test, launch the CLI:

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js agents list
node packages/cli/dist/index.js templates list
node packages/cli/dist/index.js run --task "refactor UI" --preset squad --dry-run
```

## Packages

| Package | Purpose |
| --- | --- |
| `@copilot-fleet/shared` | Shared types, constants, validation, and serialization for graphs, sessions, providers, and agents. |
| `@copilot-fleet/core` | Execution engine, scheduler, dispatcher, graph utilities, session state, and configuration helpers. |
| `@copilot-fleet/providers` | Provider adapters for GitHub Copilot, OpenAI, Anthropic, Ollama, LM Studio, custom APIs, and VS Code local integration. |
| `@copilot-fleet/agents` | Builtin agent definitions (10 agents) plus custom JSON/YAML agent loading and validation. |
| `@copilot-fleet/web` | React 19 + React Flow 12 web dashboard with node editor, onboarding wizard, console, and settings. |
| `@copilot-fleet/vscode-extension` | VS Code extension with Chat Participant `@fleet`, webview graph panel, sidebar, and status bar. |
| `@copilot-fleet/cli` | CLI with 9 commands: run, serve, status, abort, agents, providers, templates, history, interactive. |
| `@copilot-fleet/mcp-server` | MCP server (stdio transport) with 5 tools, resources, and prompts for AI tool integration. |

## Architecture

The monorepo is intentionally split so each layer has a single job:

```text
User graph / UI templates
        |
        v
@copilot-fleet/shared
  - FleetGraph schema
  - validation + serialization
        |
        v
@copilot-fleet/core
  - engine
  - scheduler
  - dispatcher
  - graph traversal
        |
        +-------------------+
        |                   |
        v                   v
@copilot-fleet/agents   @copilot-fleet/providers
  - builtin agents        - provider adapters
  - custom YAML/JSON      - remote/local model backends
        \                   /
         \                 /
          +---- host app --+
```

Execution follows a DAG model. Graph validation rejects cycles, nodes are scheduled in waves, and node config can carry agent and provider selection such as `agentId`, `provider`, and `model`.

## Templates

The repository now includes ready-to-use graph templates in the `templates/` directory:

| Template | Description | Tags |
| --- | --- | --- |
| `quick-fix.json` | Minimal Trigger -> Coder -> Output flow for small fixes. | `quick`, `single-agent` |
| `feature-squad.json` | Sequential Planner -> Coder -> Reviewer pipeline for feature work. | `feature`, `pipeline`, `3-agents` |
| `fullstack-team.json` | Parallel Planner -> Splitter -> Coder/Tester/Designer -> Merger -> Reviewer flow. | `fullstack`, `parallel`, `6-agents` |
| `refactor-platoon.json` | Research and refactor pipeline with security and testing gates. | `refactoring`, `security`, `5-agents` |
| `security-audit.json` | Conditional audit graph that branches into remediation when issues are found. | `security`, `audit`, `conditional` |

## Configuration

### Provider types

CopilotFleet currently supports these provider identifiers:

- `github-copilot`
- `openai`
- `anthropic`
- `ollama`
- `lmstudio`
- `custom-api`
- `vscode-local`

### Recommended environment variables

The exact names are up to the host application, but these variables are a practical convention:

- `GITHUB_COPILOT_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `OLLAMA_BASE_URL`
- `LMSTUDIO_BASE_URL`
- `CUSTOM_API_BASE_URL`
- `CUSTOM_API_KEY`

### Provider setup notes

- `github-copilot` requires an API token and targets `https://api.githubcopilot.com/chat/completions`.
- `openai` defaults to `https://api.openai.com` unless `baseUrl` is overridden.
- `anthropic` calls `https://api.anthropic.com/v1/messages` and uses `x-api-key`.
- `custom-api` extends the OpenAI-compatible provider path and requires `baseUrl`.
- `vscode-local` is a placeholder integration point and currently returns a message indicating that a VS Code extension is required.

## CLI

The `@copilot-fleet/cli` package provides a full command-line interface built with commander.js:

```bash
# Execute a task
fleet run --task "refactor auth module" --repo owner/repo --preset squad

# Use a template
fleet run --repo owner/repo --template fullstack-team

# Start web dashboard
fleet serve --port 3847

# Interactive TUI session builder
fleet interactive

# Agent management
fleet agents list
fleet agents add ./my-agent.yaml
fleet agents remove frontend-specialist

# Provider management
fleet providers list
fleet providers add openai --key sk-...
fleet providers test ollama

# Templates
fleet templates list
fleet templates use fullstack-team --repo owner/repo

# Session management
fleet status
fleet abort --session <id>
fleet history list
```

## Web dashboard

The `@copilot-fleet/web` package is a React 19 + React Flow 12 web application with:

- **Canvas**: drag-and-drop node editor with 10 node types (trigger, agent, LLM, splitter, merger, condition, human, tool, output, group)
- **Sidebar**: agent library with search, drag-and-drop palette
- **Inspector**: detailed node configuration (provider, model, prompt, files, parameters)
- **Console**: real-time execution logs
- **Toolbar**: run/stop/save/load controls, session timer, progress
- **Onboarding**: 4-step wizard for first-time users (welcome → provider → template → launch)
- **Settings**: provider configuration, theme, locale, grid settings

Dark theme by default with neon glow effects inspired by vifix.art / ComfyUI.

## MCP server

The `@copilot-fleet/mcp-server` package provides a stdio-based [Model Context Protocol](https://modelcontextprotocol.io) server for integration with any MCP-compatible AI tool (VS Code Copilot Chat, Claude Code, Cursor, etc.).

**Tools**: `launch_fleet`, `fleet_status`, `list_agents`, `abort_fleet`, `add_agent`

**Resources**: `fleet://agents`, `fleet://sessions/{id}`, `fleet://providers`, `fleet://templates`

**Prompts**: `orchestrate` (task orchestration template), `decompose` (task decomposition template)

Configure in VS Code via `.vscode/mcp.json`:

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

Then in any MCP client:

```
Use launch_fleet: task "refactor UI", repo "owner/repo", agents 3
```

Build: `pnpm --filter @copilot-fleet/mcp-server run build`

## VS Code extension

The `@copilot-fleet/vscode-extension` package provides native VS Code integration:

**Chat Participant `@fleet`** with slash commands:

```
@fleet Optimize the UI --agents 5
@fleet /run Add tests for all components
@fleet /plan Refactor auth module (dry run)
@fleet /status
@fleet /abort
@fleet /graph    → opens node editor in a new tab
@fleet /agents   → lists available agents
@fleet /templates → template gallery
```

**Extension commands**: `copilot-fleet.openGraph`, `copilot-fleet.run`, `copilot-fleet.stop`, `copilot-fleet.abort`, `copilot-fleet.status`, `copilot-fleet.openSidebar`, `copilot-fleet.loadTemplate`, `copilot-fleet.listAgents`.

**Webview**: graph panel with the React Flow editor, sidebar with session management, status bar with progress indicator.

Build: `pnpm --filter @copilot-fleet/vscode-extension run build` (esbuild → dist/extension.js).

## Creating custom agents

Custom agents can be discovered from JSON or YAML files. A minimal YAML definition looks like this:

```yaml
id: custom-architect
name: architect
displayName: Architecture Advisor
description: Reviews solution shape, dependencies, and long-term maintainability.
provider: github-copilot
model: claude-sonnet-4
systemPrompt: |
  You are a software architect. Optimize for clarity, maintainability, and explicit trade-offs.
parameters:
  temperature: 0.2
  maxTokens: 6144
  timeout: 1200000
labels:
  - architecture
  - review
builtin: false
files:
  include:
    - packages/**
  exclude:
    - dist/**
hooks:
  before: echo Preparing architecture review
  after: echo Architecture review complete
```

The custom loader normalizes IDs, validates provider and parameter fields, and accepts both JSON and YAML file formats.

## Documentation

Detailed guides are in the `docs/` directory:

| Document | Description |
| --- | --- |
| [Getting Started](docs/getting-started.md) | Installation, first run, and integration options |
| [Architecture](docs/architecture.md) | Package structure, DAG execution model, event system |
| [Graph Format](docs/graph-format.md) | Node types, edge schema, validation rules, color scheme |
| [Creating Agents](docs/creating-agents.md) | Builtin agents, custom YAML/JSON definitions, AgentRegistry API |
| [Creating Providers](docs/creating-providers.md) | Provider types, configuration, ProviderAdapter interface |
| [API Reference](docs/api-reference.md) | Full API surface for all 8 packages |

## Contributing

1. Install dependencies with `pnpm install`.
2. Make focused changes inside the relevant package.
3. Run `pnpm build` and `pnpm typecheck` before opening a review.
4. Update templates or documentation when behavior or public contracts change.

Keep changes incremental. Avoid cross-package abstractions unless at least several call sites clearly benefit from them.

## License

MIT