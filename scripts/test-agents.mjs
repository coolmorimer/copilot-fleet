#!/usr/bin/env node
/**
 * Integration smoke test: sends real LLM requests through the Vite dev proxy
 * for each builtin agent persona to verify the full request/response cycle.
 *
 * Usage: node scripts/test-agents.mjs <GITHUB_PAT>
 * Requires: Vite dev server running on localhost:3847
 */

const PROXY = 'http://localhost:3847';
const PAT = process.argv[2];

if (!PAT) {
  console.error('Usage: node scripts/test-agents.mjs <GITHUB_PAT>');
  process.exit(1);
}

/* ── Model mapping (same as llm-client.ts) ─────────── */
function mapModel(model) {
  const MAP = {
    'claude-sonnet-4': 'gpt-4o',
    'claude-3-7-sonnet': 'gpt-4o',
    'claude-3-5-haiku': 'gpt-4o-mini',
  };
  return MAP[model] ?? model;
}

/* ── Agent definitions ─────────────────────────────── */
const AGENTS = [
  {
    id: 'builtin-planner',
    name: '📋 Planner',
    model: 'claude-sonnet-4',
    systemPrompt: 'You are a planning specialist. Break the task into clear steps.',
    userMessage: 'Plan a refactoring of a 500-line Express.js REST API into modular route handlers. Give 3 steps.',
  },
  {
    id: 'builtin-coder',
    name: '🤖 Coder',
    model: 'claude-sonnet-4',
    systemPrompt: 'You are an expert software developer. Write clean, production-ready code.',
    userMessage: 'Write a TypeScript function `debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T` with proper types.',
  },
  {
    id: 'builtin-reviewer',
    name: '📝 Reviewer',
    model: 'claude-sonnet-4',
    systemPrompt: 'You are a senior code reviewer. Find the most important defects.',
    userMessage: 'Review this code:\n```ts\napp.get("/users/:id", async (req, res) => {\n  const user = await db.query(`SELECT * FROM users WHERE id = ${req.params.id}`);\n  res.json(user);\n});\n```',
  },
  {
    id: 'builtin-tester',
    name: '🧪 Tester',
    model: 'gpt-4o',
    systemPrompt: 'You are a testing specialist. Write focused, well-structured tests.',
    userMessage: 'Write a unit test (vitest) for a function `isPalindrome(s: string): boolean`.',
  },
  {
    id: 'builtin-security',
    name: '🔒 Security',
    model: 'gpt-4o',
    systemPrompt: 'You are a security specialist. Identify vulnerabilities and suggest fixes.',
    userMessage: 'Audit this Express middleware:\n```ts\napp.use((req, res, next) => {\n  res.setHeader("Access-Control-Allow-Origin", req.headers.origin);\n  next();\n});\n```',
  },
];

/* ── Test runner ───────────────────────────────────── */

// First try Copilot token exchange
async function tryGetCopilotToken() {
  try {
    const res = await fetch(`${PROXY}/api/proxy/github-api/copilot_internal/v2/token`, {
      headers: { Authorization: `token ${PAT}`, Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      return data.token;
    }
    return null;
  } catch {
    return null;
  }
}

async function sendRequest(agent, endpoint, headers) {
  const model = endpoint.includes('github-models') ? mapModel(agent.model) : agent.model;

  const body = {
    model,
    messages: [
      { role: 'system', content: agent.systemPrompt },
      { role: 'user', content: agent.userMessage },
    ],
    temperature: 0.2,
    max_tokens: 300,
    stream: false,
  };

  const res = await fetch(`${PROXY}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

async function testAgent(agent, endpoint, headers, pathLabel) {
  const start = Date.now();
  try {
    const data = await sendRequest(agent, endpoint, headers);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const content = data.choices?.[0]?.message?.content ?? '';
    const tokens = data.usage?.total_tokens ?? '?';
    const model = data.model ?? '?';

    const preview = content.replace(/\n/g, ' ').slice(0, 120);
    console.log(`  ✅ ${agent.name} [${pathLabel}]  ${elapsed}s  model=${model}  tokens=${tokens}`);
    console.log(`     "${preview}${content.length > 120 ? '…' : ''}"`);
    return { ok: true, agent: agent.id, elapsed, tokens };
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  ❌ ${agent.name} [${pathLabel}]  ${elapsed}s  ERROR: ${err.message}`);
    return { ok: false, agent: agent.id, error: err.message };
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  CopilotFleet Agent Integration Tests');
  console.log('═══════════════════════════════════════\n');

  // Check Vite proxy is up
  try {
    await fetch(`${PROXY}/`);
  } catch {
    console.error('❌ Vite dev server not reachable at', PROXY);
    process.exit(1);
  }
  console.log(`✓ Vite dev server reachable at ${PROXY}\n`);

  // Determine auth path
  console.log('Checking Copilot token exchange...');
  const copilotToken = await tryGetCopilotToken();

  let endpoint, headers, pathLabel;
  if (copilotToken) {
    console.log('✓ Copilot session token acquired — using Copilot API\n');
    endpoint = '/api/proxy/github-copilot/chat/completions';
    headers = {
      Authorization: `Bearer ${copilotToken}`,
      'Editor-Version': 'vscode/1.96.0',
      'Editor-Plugin-Version': 'copilot-fleet/0.1.0',
      'Copilot-Integration-Id': 'vscode-chat',
    };
    pathLabel = 'Copilot API';
  } else {
    console.log('⚠ Copilot token exchange failed — using GitHub Models fallback\n');
    endpoint = '/api/proxy/github-models/chat/completions';
    headers = { Authorization: `Bearer ${PAT}` };
    pathLabel = 'GitHub Models';
  }

  // Run tests sequentially to avoid rate limits
  console.log(`Testing ${AGENTS.length} agents via ${pathLabel}:\n`);
  const results = [];

  for (const agent of AGENTS) {
    const result = await testAgent(agent, endpoint, headers, pathLabel);
    results.push(result);
    console.log('');
  }

  // Summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log('═══════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed out of ${results.length}`);
  console.log('═══════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
