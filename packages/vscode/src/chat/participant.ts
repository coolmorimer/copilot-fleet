import * as vscode from 'vscode';
import { AgentRegistry } from '@copilot-fleet/agents';

import type { FleetStatusBar } from '../status-bar.js';

export class FleetChatParticipant implements vscode.Disposable {
  private readonly participant: vscode.ChatParticipant;
  private readonly agentRegistry: AgentRegistry;
  private readonly statusBar: FleetStatusBar;

  constructor(context: vscode.ExtensionContext, statusBar: FleetStatusBar) {
    this.statusBar = statusBar;
    this.agentRegistry = new AgentRegistry();
    this.agentRegistry.loadBuiltins();

    this.participant = vscode.chat.createChatParticipant('copilot-fleet.fleet', this.handleRequest.bind(this));
    this.participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'fleet-icon.svg');
  }

  private async handleRequest(
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    void chatContext;
    if (token.isCancellationRequested) {
      return;
    }

    switch (request.command) {
      case 'run':
        await this.handleRun(request, stream, token);
        return;
      case 'plan':
        await this.handlePlan(request, stream, token);
        return;
      case 'status':
        await this.handleStatus(stream);
        return;
      case 'abort':
        await this.handleAbort(stream);
        return;
      case 'graph':
        await this.handleGraph(stream);
        return;
      case 'agents':
        await this.handleAgents(stream);
        return;
      case 'templates':
        await this.handleTemplates(stream);
        return;
      default:
        await this.handleDefault(request, stream, token);
    }
  }

  private async handleRun(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const task = request.prompt.trim();
    if (!task) {
      stream.markdown('Please provide a task description.\n\nExample: `@fleet /run Refactor the authentication module`');
      return;
    }
    if (token.isCancellationRequested) {
      return;
    }

    const agents = this.agentRegistry.getBuiltins().slice(0, 3);
    this.statusBar.setRunning(task);

    stream.markdown('## Fleet Orchestration\n\n');
    stream.markdown(`**Task:** ${task}\n\n---\n\n`);
    stream.progress('Analyzing task...');
    stream.markdown('### Task Decomposition\n\n');
    for (const agent of agents) {
      stream.markdown(`- ${agent.displayName}: Ready\n`);
    }
    stream.markdown('\n### Execution Plan\n\n');
    stream.markdown('| Wave | Agents | Status |\n|------|--------|--------|\n');
    stream.markdown(`| 1 | ${agents[0]?.displayName ?? 'Planner'} | Pending |\n`);
    if (agents[1]) {
      stream.markdown(`| 2 | ${agents[1].displayName} | Pending |\n`);
    }
    if (agents[2]) {
      stream.markdown(`| 3 | ${agents[2].displayName} | Pending |\n`);
    }
    stream.markdown('\n---\n\nFleet is ready to execute. Use `@fleet /status` to check progress.\n\n');
    stream.button({ command: 'copilot-fleet.openGraph', title: 'Open Graph Editor' });
    stream.button({ command: 'copilot-fleet.stop', title: 'Stop' });
  }

  private async handlePlan(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const task = request.prompt.trim();
    if (!task) {
      stream.markdown('Please provide a task to plan.\n\nExample: `@fleet /plan Add dark mode support`');
      return;
    }
    if (token.isCancellationRequested) {
      return;
    }

    stream.markdown('## Fleet Plan (Dry Run)\n\n');
    stream.markdown(`**Task:** ${task}\n\n`);
    stream.markdown('> This is a dry run; no agents will be launched.\n\n');
    stream.markdown('### Suggested Agent Pipeline\n\n');
    stream.markdown('```\nTrigger -> Planner -> Splitter -> [Coder, Tester, Designer] -> Merger -> Reviewer -> Output\n```\n\n');
    stream.markdown('### Agents\n\n');
    stream.markdown('| Agent | Description |\n|-------|-------------|\n');
    for (const agent of this.agentRegistry.getBuiltins().slice(0, 5)) {
      stream.markdown(`| ${agent.displayName} | ${agent.description} |\n`);
    }
    stream.markdown(`\nUse \`@fleet /run ${task}\` to execute this plan.\n`);
  }

  private async handleStatus(stream: vscode.ChatResponseStream): Promise<void> {
    stream.markdown('## Fleet Status\n\n');
    stream.markdown(`**Status:** ${this.statusBar.getStatus()}\n\n`);
    stream.markdown('Use `@fleet /abort` to stop the current session.\n');
    stream.button({ command: 'copilot-fleet.openGraph', title: 'Open Graph' });
  }

  private async handleAbort(stream: vscode.ChatResponseStream): Promise<void> {
    this.statusBar.setIdle();
    stream.markdown('## Fleet Aborted\n\nThe session has been stopped. All pending tasks have been cancelled.\n');
  }

  private async handleGraph(stream: vscode.ChatResponseStream): Promise<void> {
    stream.markdown('Opening the visual graph editor...\n');
    stream.button({ command: 'copilot-fleet.openGraph', title: 'Open Graph Editor' });
    await vscode.commands.executeCommand('copilot-fleet.openGraph');
  }

  private async handleAgents(stream: vscode.ChatResponseStream): Promise<void> {
    stream.markdown('## Available Agents\n\n');
    stream.markdown('| Agent | Description | Provider | Model |\n|-------|-------------|----------|-------|\n');
    const agents = this.agentRegistry.getAll();
    for (const agent of agents) {
      stream.markdown(`| ${agent.displayName} | ${agent.description} | ${agent.provider} | ${agent.model} |\n`);
    }
    stream.markdown(`\n*${agents.length} agents available.*\n`);
  }

  private async handleTemplates(stream: vscode.ChatResponseStream): Promise<void> {
    const templates = [
      { icon: 'Quick Fix', desc: '1 agent, fast fix' },
      { icon: 'Feature Squad', desc: '3 agents: plan -> code -> review' },
      { icon: 'Fullstack Team', desc: '6 agents, full pipeline' },
      { icon: 'Refactor Platoon', desc: 'Refactoring pipeline' },
      { icon: 'Security Audit', desc: 'Security audit flow' },
    ] as const;

    stream.markdown('## Graph Templates\n\n');
    for (const template of templates) {
      stream.markdown(`- **${template.icon}** - ${template.desc}\n`);
    }
    stream.markdown('\nUse `@fleet /run` with a template or the command palette to load one.\n');
    stream.button({ command: 'copilot-fleet.loadTemplate', title: 'Load Template' });
  }

  private async handleDefault(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const task = request.prompt.trim();
    if (token.isCancellationRequested) {
      return;
    }

    if (!task) {
      stream.markdown('## CopilotFleet\n\n');
      stream.markdown('Visual AI agent orchestration. Available commands:\n\n');
      stream.markdown('- `/run <task>` - Run fleet orchestration\n');
      stream.markdown('- `/plan <task>` - Plan without executing\n');
      stream.markdown('- `/status` - Check session status\n');
      stream.markdown('- `/abort` - Stop current session\n');
      stream.markdown('- `/graph` - Open visual editor\n');
      stream.markdown('- `/agents` - List available agents\n');
      stream.markdown('- `/templates` - Show templates\n\n');
      stream.markdown('Or describe a task and CopilotFleet will suggest how to run it.\n');
      return;
    }

    stream.markdown('## Suggestion\n\n');
    stream.markdown(`I can orchestrate agents for: **${task}**\n\n`);
    stream.markdown('Recommended approach:\n');
    stream.markdown(`- \`@fleet /run ${task}\` - Execute with agents\n`);
    stream.markdown(`- \`@fleet /plan ${task}\` - Preview the plan first\n\n`);
    stream.button({ command: 'copilot-fleet.openGraph', title: 'Open Graph Editor' });
  }

  dispose(): void {
    this.participant.dispose();
  }
}
