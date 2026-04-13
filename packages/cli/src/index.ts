#!/usr/bin/env node
import { Command } from 'commander';

import { VERSION } from '@copilot-fleet/shared';

import { registerAbortCommand } from './commands/abort.js';
import { registerAgentsCommand } from './commands/agents.js';
import { registerHistoryCommand } from './commands/history.js';
import { registerInteractiveCommand } from './commands/interactive.js';
import { registerProvidersCommand } from './commands/providers.js';
import { registerRunCommand } from './commands/run.js';
import { registerServeCommand } from './commands/serve.js';
import { registerStatusCommand } from './commands/status.js';
import { registerTemplatesCommand } from './commands/templates.js';

const program = new Command();

program.name('fleet').version(VERSION).description('CopilotFleet — Visual Agent Orchestration');

registerRunCommand(program);
registerServeCommand(program);
registerStatusCommand(program);
registerAbortCommand(program);
registerAgentsCommand(program);
registerProvidersCommand(program);
registerTemplatesCommand(program);
registerInteractiveCommand(program);
registerHistoryCommand(program);

await program.parseAsync(process.argv);