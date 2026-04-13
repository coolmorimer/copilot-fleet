---
title: Creating custom agents
version: 0.1.0
lastUpdated: 2026-04-13
status: draft
---

# Creating custom agents

Review owners: platform maintainers

AI assistance: Drafted with GitHub Copilot, then checked against the current monorepo source.

This guide explains how custom agents fit into CopilotFleet, how to define them in YAML or JSON, and how to load them through the CLI, code, MCP, or the web UI.

Source of truth:
- [packages/agents/src/registry.ts](../packages/agents/src/registry.ts)
- [packages/agents/src/custom/loader.ts](../packages/agents/src/custom/loader.ts)
- [packages/shared/src/types.ts](../packages/shared/src/types.ts)
- [packages/shared/src/validation.ts](../packages/shared/src/validation.ts)
- [packages/mcp/src/tools/add-agent.ts](../packages/mcp/src/tools/add-agent.ts)
- [packages/web/src/components/Sidebar.tsx](../packages/web/src/components/Sidebar.tsx)
- [packages/web/src/panels/AgentEditor.tsx](../packages/web/src/panels/AgentEditor.tsx)

## Overview

CopilotFleet ships with 10 builtin agents. Users can add custom agents via YAML or JSON definition files and register them at runtime.

Builtin agents are loaded by AgentRegistry.loadBuiltins(). Custom agents are loaded from files, registered through code, or added through the MCP server.

## Builtin agents

| ID | Display Name | Purpose |
| --- | --- | --- |
| builtin-coder | 🤖 Coder | Writes production-ready code |
| builtin-reviewer | 📝 Reviewer | Reviews for bugs, regressions, security |
| builtin-tester | 🧪 Tester | Designs and writes tests |
| builtin-refactorer | ♻️ Refactorer | Refactors for clarity and performance |
| builtin-documenter | 📚 Documenter | Writes documentation |
| builtin-security | 🔒 Security | OWASP security review |
| builtin-designer | 🎨 Designer | UI/UX and system design |
| builtin-devops | 🚀 DevOps | Infrastructure, CI/CD, monitoring |
| builtin-researcher | 🔬 Researcher | Researches solutions and alternatives |
| builtin-planner | 📋 Planner | Breaks work into implementation phases |

## Agent definition schema

Custom agents use the shared AgentDefinition shape:

```ts
interface AgentDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon?: string;
  color?: string;
  provider: ProviderType; // 'github-copilot' | 'openai' | 'anthropic' | 'ollama' | 'lmstudio' | 'custom-api' | 'vscode-local'
  model: string;
  fallbackModel?: string;
  systemPrompt: string;
  parameters: { temperature: number; maxTokens: number; timeout: number };
  files?: { include?: string[]; exclude?: string[] };
  hooks?: { before?: string; after?: string };
  labels?: string[];
  builtin: boolean;
}
```

Practical notes:
- id must be unique inside the registry.
- builtin must be false for user-defined agents.
- parameters.timeout is in milliseconds.
- files and hooks are optional.

## YAML example

Example file: .fleet/agents/frontend-specialist.yaml

```yaml
id: custom-frontend
name: frontend-specialist
displayName: "🎨 Frontend Specialist"
description: "Specialist in React, TypeScript and CSS"
icon: palette
color: "#f59e0b"
provider: github-copilot
model: claude-sonnet-4
fallbackModel: gpt-5-mini
systemPrompt: |
  You are a senior frontend developer with 10 years of experience.
  Stack: React 19, TypeScript 5, Tailwind CSS 4.
  Always write type-safe functional components.
parameters:
  temperature: 0.2
  maxTokens: 8192
  timeout: 1800000
files:
  include: ["src/components/**", "src/pages/**"]
  exclude: ["node_modules/**", "dist/**"]
hooks:
  before: "npm run lint"
  after: "npm run test -- --related"
labels: ["frontend", "ui"]
builtin: false
```

## JSON example

```json
{
  "id": "custom-frontend",
  "name": "frontend-specialist",
  "displayName": "🎨 Frontend Specialist",
  "description": "Specialist in React, TypeScript and CSS",
  "icon": "palette",
  "color": "#f59e0b",
  "provider": "github-copilot",
  "model": "claude-sonnet-4",
  "fallbackModel": "gpt-5-mini",
  "systemPrompt": "You are a senior frontend developer with 10 years of experience.\nStack: React 19, TypeScript 5, Tailwind CSS 4.\nAlways write type-safe functional components.",
  "parameters": {
    "temperature": 0.2,
    "maxTokens": 8192,
    "timeout": 1800000
  },
  "files": {
    "include": ["src/components/**", "src/pages/**"],
    "exclude": ["node_modules/**", "dist/**"]
  },
  "hooks": {
    "before": "npm run lint",
    "after": "npm run test -- --related"
  },
  "labels": ["frontend", "ui"],
  "builtin": false
}
```

## Loading agents

CopilotFleet exposes four practical loading paths.

### 1. CLI

```bash
fleet agents add ./my-agent.yaml
```

The CLI copies the source YAML or JSON file into .fleet/agents and registers it on the next load.

### 2. Programmatic

```ts
import { AgentRegistry } from '@copilot-fleet/agents';

const registry = new AgentRegistry();
registry.loadBuiltins();
registry.register(agentDef);
```

Use this when your host app owns agent creation or persistence.

### 3. MCP

Use the add_agent tool with these inputs:
- name
- displayName
- description
- provider
- model
- systemPrompt
- temperature
- maxTokens

The MCP server derives a unique slug-like id from name and applies the default timeout.

### 4. Web UI

The web package already exposes a My Agents section in the sidebar and an AgentEditor panel component for visual editing. The intended flow is Sidebar -> My Agents -> + Create Agent, which opens the visual editor.

Practical note: in the current tree, the editor component exists but the exact create-button wiring depends on the host UI shell.

## AgentRegistry API

AgentRegistry is the in-memory catalog for builtin and custom agents.

| Method | What it does |
| --- | --- |
| register(agent) | Add or replace an agent definition by id |
| unregister(id) | Remove an agent by id |
| get(id) | Return one agent or undefined |
| getAll() | Return all agents |
| getBuiltins() | Return builtin agents only |
| getCustom() | Return custom agents only |
| search(query) | Search id, name, displayName, description, and labels |
| has(id) | Check if an id exists |
| count() | Return total registered agents |
| loadBuiltins() | Register the 10 builtin agents |

## Validation and normalization

The custom loader validates the provider type, required strings, and agent parameters:
- temperature must be between 0 and 2
- maxTokens must be greater than 0
- timeout must be greater than 0

It also normalizes derived IDs when id is omitted by slugifying name. Shared validation then re-checks the final AgentDefinition before registration.

The loader accepts both JSON and YAML files discovered under nested directories.

## Using agents in a graph

Agent nodes reference agents through config.agentId.

Example:

```json
{
  "id": "agent-1",
  "type": "agent",
  "label": "Frontend",
  "config": {
    "agentId": "custom-frontend"
  }
}
```

Template graphs typically pre-wire builtin agents so a new graph can run without extra setup. If you swap in custom agents, keep agentId aligned with the registered id in AgentRegistry.

## Validation checklist

Before you load a new custom agent, verify:
- the provider exists in your runtime configuration
- the model name is valid for that provider
- the system prompt is specific enough to constrain behavior
- the hook commands are safe to run in your environment
- the files include and exclude globs match your repository layout

## Related docs

- [creating-providers.md](./creating-providers.md)
- [api-reference.md](./api-reference.md)
