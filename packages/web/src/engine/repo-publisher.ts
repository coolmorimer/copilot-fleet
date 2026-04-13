/**
 * Extracts code files from LLM output and commits them to a GitHub repository
 * using the Git Trees API (batch commit for all files at once).
 */

/* ── Types ────────────────────────────────────────────── */

export interface ExtractedFile {
  path: string;
  content: string;
}

export interface PublishResult {
  ok: boolean;
  commitUrl?: string;
  filesCount: number;
  error?: string;
}

export type PublishProgress = (message: string) => void;

/* ── File Extraction ──────────────────────────────────── */

/**
 * Parse LLM output to extract files from fenced code blocks.
 *
 * Supported formats:
 *   ```lang:path/to/file.ext      (primary — instructed format)
 *   ```path/to/file.ext            (fallback — just a path as info string)
 *   // FILE: path/to/file.ext      (inline marker before code block)
 *
 * Returns de-duplicated files (last write wins for same path).
 */
export function extractFiles(text: string): ExtractedFile[] {
  const files = new Map<string, string>();

  // Pattern: ```lang:path  or  ```path/file.ext
  // Captures info-string after ``` then content until closing ```
  const fenceRegex = /```([^\n]*)\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    const info = match[1].trim();
    const content = match[2];

    const filePath = parseFilePath(info);
    if (filePath) {
      files.set(filePath, content);
    }
  }

  // Fallback: look for "// FILE: path" or "# FILE: path" markers before un-fenced code
  if (files.size === 0) {
    const markerRegex = /(?:\/\/|#)\s*FILE:\s*(\S+)\s*\n([\s\S]*?)(?=(?:\/\/|#)\s*FILE:|\n---\n|$)/gi;
    while ((match = markerRegex.exec(text)) !== null) {
      const path = cleanPath(match[1]);
      const content = match[2].trim();
      if (path && content) {
        files.set(path, content);
      }
    }
  }

  return Array.from(files.entries()).map(([path, content]) => ({ path, content }));
}

/**
 * Parse the info string of a fenced code block to get a file path.
 *
 * Examples:
 *   "js:src/game.js"        → "src/game.js"
 *   "html:index.html"       → "index.html"
 *   "src/game.js"           → "src/game.js"   (looks like a path)
 *   "javascript"            → null             (just a language tag)
 */
function parseFilePath(info: string): string | null {
  if (!info) return null;

  // Format: lang:path/to/file
  const colonIdx = info.indexOf(':');
  if (colonIdx > 0 && colonIdx < 20) {
    const afterColon = info.slice(colonIdx + 1).trim();
    const cleaned = cleanPath(afterColon);
    if (cleaned && looksLikeFilePath(cleaned)) {
      return cleaned;
    }
  }

  // Format: just a file path (has extension and/or directory separator)
  const cleaned = cleanPath(info.split(/\s/)[0]);
  if (cleaned && looksLikeFilePath(cleaned)) {
    return cleaned;
  }

  return null;
}

function looksLikeFilePath(s: string): boolean {
  // Must have a dot (extension) or be a known config file
  if (s.includes('/') && s.includes('.')) return true;
  if (s.includes('.') && !s.startsWith('.') && s.length > 2) return true;
  // Known extension-less files
  const knownFiles = ['Dockerfile', 'Makefile', 'Procfile', 'Gemfile', 'Rakefile', '.gitignore', '.env'];
  return knownFiles.some((f) => s.endsWith(f));
}

function cleanPath(raw: string): string {
  // Remove leading slashes, ./ prefix, quotes, backticks
  return raw
    .replace(/^[`'"]+|[`'"]+$/g, '')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .trim();
}

/* ── GitHub Trees API Commit ──────────────────────────── */

interface GitTreeItem {
  path: string;
  mode: '100644';
  type: 'blob';
  content: string;
}

interface GitRefResponse {
  object: { sha: string };
}

interface GitTreeResponse {
  sha: string;
}

interface GitCommitResponse {
  sha: string;
  html_url: string;
}

/**
 * Commit multiple files to a GitHub repository in a single commit
 * using the low-level Git Trees API.
 *
 * Flow:
 *   1. GET  /git/ref/heads/{branch}   → current commit SHA
 *   2. POST /git/trees                → create tree with all files
 *   3. POST /git/commits              → create commit pointing to new tree
 *   4. PATCH /git/refs/heads/{branch} → advance branch to new commit
 */
export async function commitFilesToRepo(
  repository: string,
  branch: string,
  files: ExtractedFile[],
  commitMessage: string,
  token: string,
  onProgress?: PublishProgress,
): Promise<PublishResult> {
  if (files.length === 0) {
    return { ok: false, filesCount: 0, error: 'No files to commit' };
  }

  const api = (path: string, method: string, body?: unknown): Promise<unknown> =>
    fetch(`/api/proxy/github-api/repos/${repository}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GitHub API ${res.status}: ${text || res.statusText}`);
      }
      return res.json();
    });

  try {
    // 1. Get current HEAD SHA
    onProgress?.(`Получаю HEAD ветки ${branch}…`);
    const ref = (await api(`git/ref/heads/${branch}`, 'GET')) as GitRefResponse;
    const baseSha = ref.object.sha;

    // 2. Create tree with all files
    onProgress?.(`Создаю дерево из ${files.length} файлов…`);
    const treeItems: GitTreeItem[] = files.map((f) => ({
      path: f.path,
      mode: '100644',
      type: 'blob',
      content: f.content,
    }));

    const tree = (await api('git/trees', 'POST', {
      base_tree: baseSha,
      tree: treeItems,
    })) as GitTreeResponse;

    // 3. Create commit
    onProgress?.('Создаю коммит…');
    const commit = (await api('git/commits', 'POST', {
      message: commitMessage,
      tree: tree.sha,
      parents: [baseSha],
    })) as GitCommitResponse;

    // 4. Update branch ref
    onProgress?.('Обновляю ветку…');
    await api(`git/refs/heads/${branch}`, 'PATCH', {
      sha: commit.sha,
    });

    onProgress?.(`Готово! ${files.length} файлов закоммичено.`);

    return {
      ok: true,
      commitUrl: commit.html_url,
      filesCount: files.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, filesCount: 0, error: msg };
  }
}

/**
 * Extract files from all agent results and commit to repo.
 * This is the main entry point called by the UI.
 */
export async function publishRunToRepo(
  allResults: Map<string, { output?: unknown; status: string }>,
  repository: string,
  branch: string,
  taskPrompt: string,
  token: string,
  onProgress?: PublishProgress,
): Promise<PublishResult> {
  // Collect all text output from result nodes
  const allText: string[] = [];
  for (const [, result] of allResults) {
    if (result.status === 'skipped') continue;
    const output = typeof result.output === 'string' ? result.output : '';
    if (output.length > 0) allText.push(output);
  }

  const combined = allText.join('\n\n---\n\n');
  const files = extractFiles(combined);

  if (files.length === 0) {
    // Fallback: commit as a single markdown report (old behavior)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fallbackFile: ExtractedFile = {
      path: `.fleet/runs/run-${stamp}.md`,
      content: `# CopilotFleet Run\n\nRepository: ${repository}\nGenerated: ${new Date().toISOString()}\n\n## Output\n\n${combined}`,
    };
    onProgress?.('Код-файлы не найдены в выводе агентов. Сохраняю как отчёт…');
    return commitFilesToRepo(repository, branch, [fallbackFile], `fleet: run report ${stamp}`, token, onProgress);
  }

  onProgress?.(`Извлечено ${files.length} файлов из вывода агентов.`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const commitMsg = `feat: ${taskPrompt.slice(0, 72)}\n\nGenerated by CopilotFleet at ${stamp}\nFiles: ${files.map((f) => f.path).join(', ')}`;

  return commitFilesToRepo(repository, branch, files, commitMsg, token, onProgress);
}
