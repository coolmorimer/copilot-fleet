import { GitHubApi } from './api';
import { FleetLogger } from '../utils/logger';

export interface GitHubPR {
  number: number;
  title: string;
  html_url: string;
  state: string;
  merged: boolean;
  head: { ref: string };
  base: { ref: string };
  user: { login: string };
}

export class PullService {
  constructor(
    private readonly api: GitHubApi,
    private readonly logger: FleetLogger
  ) {}

  async findPRForIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<GitHubPR | undefined> {
    this.logger.debug(
      `Looking for PR linked to issue #${issueNumber} in ${owner}/${repo}`
    );

    // Search for PRs that reference this issue (fetch more PRs for reliability)
    const pulls = await this.api.get<GitHubPR[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=all&per_page=100&sort=created&direction=desc`
    );

    // copilot-swe-agent creates branches like copilot-swe-agent/issue-N
    const issueRef = `issue-${issueNumber}`;
    const issueHashRef = `#${issueNumber}`;
    const match = pulls.find(pr => {
      // Branch-based: must contain "issue-N" specifically (not just a bare number)
      const branchMatch = pr.head.ref.includes(issueRef);
      // Copilot agent match: author is copilot-related and title/branch references the issue
      const isCopilotAgent = pr.user.login.includes('copilot')
        || pr.user.login.includes('github-actions');
      const titleRef = pr.title.includes(issueHashRef)
        || pr.title.toLowerCase().includes(issueRef);
      return branchMatch || (isCopilotAgent && titleRef);
    });

    if (match) {
      this.logger.info(
        `Found PR #${match.number} for issue #${issueNumber}: ${match.html_url}`
      );
    }

    return match;
  }

  async getPR(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubPR> {
    return this.api.get<GitHubPR>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`
    );
  }

  async mergePR(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<void> {
    this.logger.info(`Merging PR #${prNumber} in ${owner}/${repo}`);

    await this.api.request(
      'PUT',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/merge`,
      { merge_method: 'squash' }
    );

    this.logger.info(`PR #${prNumber} merged`);
  }
}
