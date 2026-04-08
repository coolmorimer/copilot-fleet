import { FleetLogger } from '../utils/logger';
import { IssueService } from '../github/issues';
import { FleetState, SubTask } from './state';
import { getConfig } from '../utils/config';

export class Dispatcher {
  constructor(
    private readonly issueService: IssueService,
    private readonly state: FleetState,
    private readonly logger: FleetLogger
  ) {}

  async dispatch(task: SubTask, projectPrompt?: string): Promise<void> {
    const session = this.state.session;
    if (!session) {
      throw new Error('No active session');
    }

    const [owner, repo] = this.parseRepo(session.repo);
    const branch = session.branch;

    this.state.updateTask(task.id, { status: 'dispatched' });

    const issueBody = this.buildIssueBody(task, branch, session.repo, projectPrompt);

    try {
      const issue = await this.issueService.createIssue({
        owner,
        repo,
        title: `[Fleet] ${task.title}`,
        body: issueBody,
        labels: ['copilot-fleet'],
      });

      this.state.updateTask(task.id, {
        issueNumber: issue.number,
        issueUrl: issue.html_url,
        status: 'working',
      });

      // Assign copilot-swe-agent to the issue
      await this.issueService.assignCopilotAgent(owner, repo, issue.number);

      this.logger.info(
        `Task "${task.title}" dispatched as issue #${issue.number}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.state.updateTask(task.id, { status: 'failed', error: message });
      this.logger.error(`Failed to dispatch task "${task.title}": ${message}`);
      throw err;
    }
  }

  private buildIssueBody(task: SubTask, branch: string, repo: string, projectPrompt?: string): string {
    const fileAction = task.files.length > 0
      ? `\n\n### Files to create / modify\n${task.files.map(f => `- \`${f}\``).join('\n')}`
      : '';

    const projectSection = projectPrompt
      ? `\n\n### Project context\nThis task is part of a larger project:\n> ${projectPrompt}\n\nRepository: \`${repo}\``
      : '';

    return [
      `## Task for Copilot coding agent`,
      '',
      '> **Important:** If the files listed below do not exist yet, you MUST **create** them from scratch including any necessary parent directories and project configuration files.',
      projectSection,
      '',
      '### Implementation instructions',
      '',
      task.description,
      fileAction,
      '',
      '### Requirements',
      '',
      '- Write complete, production-ready code — not stubs or placeholders.',
      '- Create all necessary directories and configuration files.',
      '- Include proper imports, namespaces, and project scaffolding.',
      '- If the project uses a build system (e.g. .csproj, package.json, CMakeLists), ensure it is properly configured.',
      '- Follow standard conventions for the language and framework.',
      '',
      `**Target branch:** \`${branch}\``,
      '',
      '---',
      '*Created by [Copilot Fleet](https://github.com/marketplace/copilot-fleet) orchestrator.*',
    ].join('\n');
  }

  private parseRepo(fullRepo: string): [string, string] {
    const parts = fullRepo.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid repo format: "${fullRepo}". Expected "owner/repo".`);
    }
    return [parts[0], parts[1]];
  }
}
