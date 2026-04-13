import { createServer } from 'node:http';

import { Command } from 'commander';

import { c, failure, info, printHeader, success } from '../utils.js';

type ServeOptions = {
  port: string;
  open?: boolean;
  host: string;
};

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start the CopilotFleet web panel placeholder server')
    .option('--port <port>', 'Port number', '3847')
    .option('--open', 'Auto-open browser')
    .option('--host <host>', 'Bind host', 'localhost')
    .action(async (options: ServeOptions) => {
      try {
        await serveCommand(options);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to start the server.';
        failure(message);
        process.exit(1);
      }
    });
}

async function serveCommand(options: ServeOptions): Promise<void> {
  const port = Number.parseInt(options.port, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('Port must be a positive integer.');
  }

  const server = createServer((_, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CopilotFleet Panel</title><style>body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b1220;color:#f3f4f6;padding:3rem}main{max-width:48rem;margin:0 auto}code{color:#67e8f9}</style></head><body><main><h1>CopilotFleet Panel</h1><p>The native CLI placeholder server is running.</p><p>Open <code>packages/web</code> for the full web UI implementation.</p></main></body></html>`);
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, options.host, () => resolvePromise());
  });

  printHeader('CopilotFleet Serve');
  success(`Placeholder panel is available at ${c.bold(`http://${options.host}:${port}`)}`);
  info('Press Ctrl+C to stop the server.');
  if (options.open) {
    info('Auto-open requested. Open the URL above in your browser.');
  }
}