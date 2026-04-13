#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { VERSION } from '@copilot-fleet/shared';

import { registerPrompts } from './prompts/index.js';
import { registerResources } from './resources/index.js';
import { FleetState } from './state.js';
import { registerTools } from './tools/index.js';

const server = new McpServer(
  {
    name: 'copilot-fleet',
    version: VERSION,
  },
  {
    instructions:
      'CopilotFleet MCP Server orchestrates AI agents via tools. Use launch_fleet to start a session, fleet_status to inspect progress, list_agents to see available agents, abort_fleet to stop a session, and add_agent to register custom agents.',
  },
);

const state = new FleetState();

registerTools(server, state);
registerResources(server, state);
registerPrompts(server);

const transport = new StdioServerTransport();
await server.connect(transport);
