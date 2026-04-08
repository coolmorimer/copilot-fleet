import * as vscode from 'vscode';

export class FleetLogger {
  private readonly channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel('Copilot Fleet');
  }

  info(message: string, ...args: unknown[]): void {
    this.write('INFO', message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.write('WARN', message, args);
  }

  error(message: string, ...args: unknown[]): void {
    this.write('ERROR', message, args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.write('DEBUG', message, args);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }

  private write(level: string, message: string, args: unknown[]): void {
    const ts = new Date().toISOString();
    const suffix = args.length > 0
      ? ' ' + args.map(a => JSON.stringify(a)).join(' ')
      : '';
    this.channel.appendLine(`[${ts}] [${level}] ${message}${suffix}`);
  }
}
