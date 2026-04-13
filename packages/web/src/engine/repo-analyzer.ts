/**
 * Fetches and summarizes the structure of an existing GitHub repository.
 * Used to give agents context about what already exists in the project.
 */

export interface RepoFileEntry {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

export interface RepoAnalysis {
  /** Flat file tree (paths only, no content). */
  tree: RepoFileEntry[];
  /** Formatted tree string for injection into prompts. */
  treeSummary: string;
  /** Content of key files (README, package.json, etc.). */
  keyFiles: Map<string, string>;
  /** Formatted key files string for injection into prompts. */
  keyFilesSummary: string;
  /** Combined context string ready to inject into agents. */
  context: string;
}

/** Files to fetch full content for — the ones that define a project's shape. */
const KEY_FILE_PATTERNS = [
  'README.md', 'readme.md', 'README',
  'package.json', 'Cargo.toml', 'pyproject.toml', 'setup.py', 'go.mod',
  'requirements.txt', 'Gemfile', 'pom.xml', 'build.gradle',
  'Makefile', 'Dockerfile', 'docker-compose.yml',
  '.gitignore', 'tsconfig.json', 'vite.config.ts', 'webpack.config.js',
  'index.html',
];

const MAX_KEY_FILE_SIZE = 3000; // chars per file
const MAX_TREE_ENTRIES = 200;

/**
 * Analyze a GitHub repository: fetch its tree + key file contents.
 * Returns null if the repo can't be accessed.
 */
export async function analyzeRepo(
  repository: string,
  branch: string,
  token: string,
): Promise<RepoAnalysis | null> {
  try {
    // 1. Fetch recursive tree
    const treeRes = await fetch(
      `/api/proxy/github-api/repos/${repository}/git/trees/${branch}?recursive=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      },
    );

    if (!treeRes.ok) return null;

    const treeData = (await treeRes.json()) as {
      tree: Array<{ path: string; type: string; size?: number }>;
      truncated?: boolean;
    };

    const entries: RepoFileEntry[] = (treeData.tree ?? [])
      .slice(0, MAX_TREE_ENTRIES)
      .map((e) => ({
        path: e.path,
        type: e.type === 'tree' ? 'tree' as const : 'blob' as const,
        size: e.size,
      }));

    // 2. Build tree summary
    const treeLines = entries
      .filter((e) => e.type === 'blob')
      .map((e) => `  ${e.path}${e.size ? ` (${formatSize(e.size)})` : ''}`);

    const treeSummary = treeLines.length > 0
      ? `Project file tree (${treeLines.length} files):\n${treeLines.join('\n')}`
      : 'Empty repository (no files).';

    // 3. Fetch key files
    const keyFiles = new Map<string, string>();
    const keyPaths = entries
      .filter((e) => e.type === 'blob' && KEY_FILE_PATTERNS.some((p) => e.path === p || e.path.endsWith(`/${p}`)))
      .slice(0, 8); // limit to 8 key files

    await Promise.all(
      keyPaths.map(async (entry) => {
        try {
          const res = await fetch(
            `/api/proxy/github-api/repos/${repository}/contents/${encodeURIComponent(entry.path)}?ref=${branch}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github.raw+json',
              },
            },
          );
          if (res.ok) {
            const text = await res.text();
            keyFiles.set(entry.path, text.slice(0, MAX_KEY_FILE_SIZE));
          }
        } catch {
          // skip failed file fetches
        }
      }),
    );

    // 4. Format key files
    const keyFileParts: string[] = [];
    for (const [path, content] of keyFiles) {
      keyFileParts.push(`--- ${path} ---\n${content}`);
    }
    const keyFilesSummary = keyFileParts.length > 0
      ? `Key project files:\n\n${keyFileParts.join('\n\n')}`
      : '';

    // 5. Combined context
    const contextParts = [
      `## Existing repository: ${repository} (branch: ${branch})`,
      '',
      treeSummary,
    ];
    if (keyFilesSummary) {
      contextParts.push('', keyFilesSummary);
    }
    if (entries.length === 0) {
      contextParts.push('', 'This is a new/empty repository. Create the project from scratch.');
    } else {
      contextParts.push('', 'IMPORTANT: This is an EXISTING project. Analyze the structure above. Extend and integrate with existing code. Do NOT recreate files that already work — only modify or add what is needed.');
    }

    return {
      tree: entries,
      treeSummary,
      keyFiles,
      keyFilesSummary,
      context: contextParts.join('\n'),
    };
  } catch {
    return null;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
