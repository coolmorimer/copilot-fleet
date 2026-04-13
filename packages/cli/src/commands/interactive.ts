import { Command } from 'commander';

import { startInteractive } from '../interactive.js';
import { failure } from '../utils.js';

export function registerInteractiveCommand(program: Command): void {
  program
    .command('interactive')
    .description('Enter interactive TUI mode')
    .action(async () => {
      try {
        await startInteractive();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Interactive mode failed.';
        failure(message);
        process.exit(1);
      }
    });
}