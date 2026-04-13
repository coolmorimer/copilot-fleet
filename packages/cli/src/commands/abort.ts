import { deserializeSession, serializeSession } from '@copilot-fleet/shared';
import { Command } from 'commander';

import { c, failure, fleetPath, printHeader, readTextIfExists, success, warn, writeTextFile } from '../utils.js';

type AbortOptions = { session?: string };

export function registerAbortCommand(program: Command): void {
  program
    .command('abort')
    .description('Abort the current or specified session')
    .option('--session <id>', 'Session ID to abort')
    .action(async (options: AbortOptions) => {
      try {
        await abortCommand(options);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to abort the session.';
        failure(message);
        process.exit(1);
      }
    });
}

async function abortCommand(options: AbortOptions): Promise<void> {
  printHeader('CopilotFleet Abort');
  const sessionPath = fleetPath('session.json');
  const content = await readTextIfExists(sessionPath);
  if (!content) {
    warn('No active session to abort.');
    return;
  }

  const session = deserializeSession(content);
  if (options.session && session.id !== options.session) {
    throw new Error(`Active session is ${session.id}, not ${options.session}.`);
  }

  session.status = 'aborted';
  session.completedAt = new Date().toISOString();
  await writeTextFile(sessionPath, serializeSession(session));
  success(`Session ${c.bold(session.id)} marked as aborted.`);
}