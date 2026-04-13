import { deserializeSession } from '@copilot-fleet/shared';
import { Command } from 'commander';

import { c, failure, fleetPath, formatDuration, info, printHeader, readTextIfExists, warn } from '../utils.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show current session status')
    .action(async () => {
      try {
        await statusCommand();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to read session status.';
        failure(message);
        process.exit(1);
      }
    });
}

async function statusCommand(): Promise<void> {
  const content = await readTextIfExists(fleetPath('session.json'));
  printHeader('CopilotFleet Status');
  if (!content) {
    warn('No active session.');
    return;
  }

  const session = deserializeSession(content);
  console.log(`${c.bold('🆔 Session')} ${session.id}`);
  console.log(`${c.bold('📈 Status')} ${session.status}`);
  console.log(`${c.bold('🌊 Waves')} ${session.currentWave}/${session.totalWaves}`);
  console.log(`${c.bold('📦 Repo')} ${session.config.repo ?? 'current workspace'}`);
  if (session.startedAt) {
    const elapsed = Date.now() - Date.parse(session.startedAt);
    info(`Elapsed time: ${formatDuration(elapsed)}`);
  }
}