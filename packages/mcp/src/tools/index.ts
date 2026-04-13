import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { FleetState } from '../state.js';
import { registerAbortFleet } from './abort-fleet.js';
import { registerAddAgent } from './add-agent.js';
import { registerFleetStatus } from './fleet-status.js';
import { registerLaunchFleet } from './launch-fleet.js';
import { registerListAgents } from './list-agents.js';

export function registerTools(server: McpServer, state: FleetState): void {
  registerLaunchFleet(server, state);
  registerFleetStatus(server, state);
  registerListAgents(server, state);
  registerAbortFleet(server, state);
  registerAddAgent(server, state);
}