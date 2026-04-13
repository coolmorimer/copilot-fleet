---
title: CopilotFleet graph format
version: 0.1.0
lastUpdated: 2026-04-13
status: draft
aiAssisted: true
reviewOwners:
  - maintainers
---

# CopilotFleet graph format

This document describes the graph contract used across shared, core, CLI, MCP, web, and the VS Code extension.

## FleetGraph schema

```ts
interface FleetGraph {
  id: string;
  name: string;
  description?: string;
  nodes: FleetNode[];
  edges: FleetEdge[];
  metadata?: GraphMetadata;
}
```

`metadata` is optional and typically carries versioning, timestamps, author, tags, and locale.

## FleetNode

```ts
interface FleetNode {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  position: { x: number; y: number };
  ports: FleetPort[];
  config: Record<string, unknown>;
  status: 'idle' | 'queued' | 'running' | 'done' | 'error' | 'skipped' | 'cancelled';
  progress?: number;
  error?: string;
  result?: unknown;
}
```

## NodeType values

| Node type | Purpose |
| --- | --- |
| `trigger` | Starts a workflow from a manual or external event. |
| `agent` | Runs a named agent definition against a provider/model. |
| `llm` | Calls a model directly without the builtin-agent layer. |
| `splitter` | Fans one upstream input into multiple downstream branches. |
| `merger` | Joins multiple branches into one downstream output. |
| `condition` | Chooses a path based on runtime logic or prior output. |
| `human` | Inserts a manual approval or review step. |
| `tool` | Executes a tool-oriented task or external integration step. |
| `output` | Collects or publishes the final result. |
| `group` | Organizes nodes visually without changing execution semantics. |

## FleetEdge

```ts
interface FleetEdge {
  id: string;
  source: string;
  target: string;
  sourcePort: string;
  targetPort: string;
  label?: string;
  animated?: boolean;
}
```

## FleetPort

```ts
interface FleetPort {
  id: string;
  name: string;
  type: 'input' | 'output';
  dataType?: string;
}
```

## Common agent node config

`config` is intentionally open-ended. For `agent` nodes, these fields are the practical baseline:

```ts
{
  agentId: string;
  provider: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  files?: string[];
}
```

Other node types add their own fields. Examples in the repository include `triggerType`, `outputType`, `branchCount`, `branchLabels`, and `expectedInputs`.

## Color scheme

The shared package exports `NODE_COLORS` for consistent UI rendering.

| NodeType | Header color | Glow color |
| --- | --- | --- |
| `trigger` | `#10b981` | `#34d399` |
| `agent` | `#6366f1` | `#818cf8` |
| `llm` | `#f59e0b` | `#fbbf24` |
| `splitter` | `#06b6d4` | `#22d3ee` |
| `merger` | `#8b5cf6` | `#a78bfa` |
| `condition` | `#ef4444` | `#f87171` |
| `human` | `#ec4899` | `#f472b6` |
| `tool` | `#14b8a6` | `#2dd4bf` |
| `output` | `#22c55e` | `#4ade80` |
| `group` | `#64748b` | `#94a3b8` |

## Templates directory

The repository ships five templates in [../templates](../templates):

- `quick-fix`
- `feature-squad`
- `fullstack-team`
- `refactor-platoon`
- `security-audit`

Minimal example from `quick-fix`:

```json
{
  "id": "quick-fix",
  "name": "Quick Fix",
  "description": "Single-agent graph for small fixes and targeted code changes.",
  "nodes": [
    {
      "id": "trigger",
      "type": "trigger",
      "label": "Trigger",
      "position": { "x": 100, "y": 200 },
      "ports": [
        { "id": "out", "name": "Output", "type": "output", "dataType": "task" }
      ],
      "config": {},
      "status": "idle"
    },
    {
      "id": "coder",
      "type": "agent",
      "label": "Coder",
      "position": { "x": 400, "y": 200 },
      "ports": [
        { "id": "in", "name": "Input", "type": "input", "dataType": "task" },
        { "id": "out", "name": "Output", "type": "output", "dataType": "patch" }
      ],
      "config": {
        "agentId": "builtin-coder",
        "provider": "github-copilot",
        "model": "claude-sonnet-4"
      },
      "status": "idle"
    },
    {
      "id": "output",
      "type": "output",
      "label": "Output",
      "position": { "x": 700, "y": 200 },
      "ports": [
        { "id": "in", "name": "Input", "type": "input", "dataType": "patch" }
      ],
      "config": {},
      "status": "idle"
    }
  ],
  "edges": [
    {
      "id": "trigger-to-coder",
      "source": "trigger",
      "sourcePort": "out",
      "target": "coder",
      "targetPort": "in"
    },
    {
      "id": "coder-to-output",
      "source": "coder",
      "sourcePort": "out",
      "target": "output",
      "targetPort": "in"
    }
  ]
}
```

## Validation rules

`validateGraph()` in shared checks structural graph validity:

- graph id and name are required
- no duplicate node ids
- no duplicate edge ids
- no duplicate port ids within a node
- edge source and target must point to existing nodes
- edge ports must exist on the referenced nodes
- edges must connect output ports to input ports
- no cycles; execution graphs must remain DAGs
- maximum 50 nodes
- maximum 100 edges

Agent and provider references are not fully resolved by `validateGraph()` alone. Validate custom agent definitions separately and ensure provider configuration exists before execution.

## Serialization

Shared exports two graph helpers:

- `serializeGraph()` converts a validated `FleetGraph` into a JSON string
- `deserializeGraph()` parses JSON and validates it before returning a `FleetGraph`

These functions are used for save/load workflows, template import/export, and inter-package communication.

## Validation

Use these checks after editing templates or graph-related contracts:

```bash
pnpm build
pnpm typecheck
```
