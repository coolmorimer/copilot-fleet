import * as vscode from 'vscode';
import { FleetLogger } from '../utils/logger';
import { withRetry } from '../utils/retry';

export class GitHubApi {
  private token = '';
  private readonly logger: FleetLogger;

  constructor(logger: FleetLogger) {
    this.logger = logger;
  }

  async ensureAuth(): Promise<void> {
    if (this.token) {
      return;
    }
    const session = await vscode.authentication.getSession('github', ['repo'], {
      createIfNone: true,
    });
    this.token = session.accessToken;
    this.logger.info('GitHub authentication successful');
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    await this.ensureAuth();

    const url = path.startsWith('https://')
      ? path
      : `https://api.github.com${path}`;

    this.logger.debug(`${method} ${url}`);

    const response = await withRetry(
      async () => {
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
            'User-Agent': 'copilot-fleet-extension',
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`GitHub API ${res.status}: ${text}`);
        }

        return res;
      },
      { logger: this.logger }
    );

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async validateRepo(owner: string, repo: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.ensureAuth();
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'copilot-fleet-extension',
        },
      });
      if (res.status === 404) {
        return { ok: false, error: `Репозиторий ${owner}/${repo} не найден или нет доступа. Проверьте имя и права токена GitHub.` };
      }
      if (res.status === 403) {
        return { ok: false, error: `Нет прав доступа к ${owner}/${repo}. Переавторизуйтесь в GitHub.` };
      }
      if (!res.ok) {
        return { ok: false, error: `GitHub API ${res.status} при проверке ${owner}/${repo}` };
      }
      const data = await res.json() as { permissions?: { push?: boolean } };
      if (data.permissions && !data.permissions.push) {
        return { ok: false, error: `Нет прав записи в ${owner}/${repo}. Issues требуют write-доступ.` };
      }
      return { ok: true };
    } catch (err) {
      const msg = String(err);
      if (err instanceof TypeError || msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('network')) {
        return { ok: false, error: 'Не удалось подключиться к GitHub API. Проверьте интернет-соединение и доступность api.github.com.' };
      }
      return { ok: false, error: `Ошибка при проверке репозитория: ${err}` };
    }
  }

  async createRepo(name: string, description?: string, isPrivate?: boolean): Promise<{ full_name: string; html_url: string }> {
    await this.ensureAuth();
    const res = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'copilot-fleet-extension',
      },
      body: JSON.stringify({
        name,
        description: description ?? 'Created by Copilot Fleet',
        private: isPrivate ?? false,
        auto_init: true,
        has_issues: true,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API ${res.status}: ${text}`);
    }
    return res.json() as Promise<{ full_name: string; html_url: string }>;
  }

  async getRepoTree(owner: string, repo: string, branch: string = 'main'): Promise<string[]> {
    try {
      await this.ensureAuth();
      const data = await this.get<{ tree: Array<{ path: string; type: string }> }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`
      );
      return data.tree
        .filter(item => item.type === 'blob')
        .map(item => item.path);
    } catch {
      this.logger.warn('Failed to fetch repo tree — treating as empty repo');
      return [];
    }
  }

  async getFileContent(owner: string, repo: string, path: string, branch?: string): Promise<string | null> {
    try {
      await this.ensureAuth();
      const ref = branch ? `?ref=${encodeURIComponent(branch)}` : '';
      const data = await this.get<{ content: string; encoding: string }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}${ref}`
      );
      if (data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }
      return data.content;
    } catch {
      return null;
    }
  }
}
