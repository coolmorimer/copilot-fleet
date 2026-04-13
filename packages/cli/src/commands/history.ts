import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { deserializeSession } from '@copilot-fleet/shared';
import { Command } from 'commander';

import { failure, fleetPath, printHeader, printTable, readTextIfExists, warn } from '../utils.js';

export function registerHistoryCommand(program: Command): void {
  program
    .command('history')
    .description('Show session history')
    .action(async () => {
      try {
        await historyCommand();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load session history.';
        failure(message);
        process.exit(1);
      }
    });
}

async function historyCommand(): Promise<void> {
  const historyDir = fleetPath('history');
  printHeader('CopilotFleet History');

  try {
    const files = (await readdir(historyDir)).filter((file) => file.endsWith('.json')).sort().reverse();
    if (files.length === 0) {
      warn('No session history found.');
      return;
    }

    const rows: string[][] = [];
    for (const file of files) {
      const content = await readTextIfExists(resolve(historyDir, file));
      if (!content) {
        continue;
      }
      const session = deserializeSession(content);
      rows.push([session.id, session.status, session.startedAt ?? '-', session.completedAt ?? '-']);
    }
    printTable(['Session', 'Status', 'Started', 'Completed'], rows);
  } catch {
    warn('No session history found.');
  }
}