import { GitHubApi } from './api';
import { FleetLogger } from '../utils/logger';

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  html_url: string;
  state: string;
  assignees: Array<{ login: string }>;
}

export interface CreateIssueParams {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
}

export class IssueService {
  constructor(
    private readonly api: GitHubApi,
    private readonly logger: FleetLogger
  ) {}

  async createIssue(params: CreateIssueParams): Promise<GitHubIssue> {
    const { owner, repo, title, body, labels, assignees } = params;

    this.logger.info(`Creating issue: "${title}" in ${owner}/${repo}`);

    const issue = await this.api.post<GitHubIssue>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
      {
        title,
        body,
        labels: labels ?? ['copilot-fleet'],
        assignees: assignees ?? [],
      }
    );

    this.logger.info(`Issue #${issue.number} created: ${issue.html_url}`);
    return issue;
  }

  async assignCopilotAgent(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<void> {
    this.logger.info(
      `Assigning copilot-swe-agent to issue #${issueNumber}`
    );

    // copilot-swe-agent is triggered by assigning it to the issue
    await this.api.post(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/assignees`,
      { assignees: ['copilot-swe-agent[bot]'] }
    );

    this.logger.info(`copilot-swe-agent assigned to #${issueNumber}`);
  }

  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<GitHubIssue> {
    return this.api.get<GitHubIssue>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`
    );
  }

  async closeIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<void> {
    await this.api.patch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
      { state: 'closed' }
    );
  }
}
