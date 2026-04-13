import type { FleetEdge, FleetGraph, FleetNode, NodeType, ProviderConfig, ProviderType } from '@copilot-fleet/shared';

import { clonePorts, NODE_TEMPLATES } from './graph-store.helpers.js';
import { complete } from '../engine/llm-client.js';

export type StarterTemplateId = 'quick-fix' | 'feature-squad' | 'fullstack-team' | 'empty';

interface AgentSkillProfile {
  label: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  preferredProviders: ProviderType[];
}

const AGENT_SKILLS: Record<string, AgentSkillProfile> = {
  planner: {
    label: 'Planner',
    systemPrompt: [
      'You are a senior technical architect and planning specialist.',
      'FIRST: Carefully analyze the existing repository structure and files provided in the context.',
      'If the repo already has code, plan ADDITIONS and MODIFICATIONS — do not recreate existing files.',
      '',
      'Convert user request into an implementation-ready technical specification:',
      '1) Goal, scope, and acceptance criteria (be specific — measurable outcomes)',
      '2) Technology stack analysis — what is already used, what to add',
      '3) Architecture decisions with rationale',
      '4) COMPLETE file structure — list EVERY file to create/modify with its full path',
      '5) Detailed work breakdown by agent role:',
      '   - Coder: which files to create, what each file does, APIs/interfaces between them',
      '   - Designer: layout structure, color scheme, responsive breakpoints, animations',
      '   - Tester: what test scenarios, which testing framework',
      '   - Other roles as needed',
      '6) Integration plan — how new code connects to existing codebase',
      '7) Per-agent task prompts — detailed enough that each agent can work independently',
      '',
      'Be thorough. This plan drives the entire implementation. Spend time on it.',
      'Output should be 1000+ words with specific file paths, function names, data structures.',
    ].join('\n'),
    temperature: 0.3,
    maxTokens: 16384,
    preferredProviders: ['github-copilot', 'openai', 'anthropic'],
  },
  coder: {
    label: 'Coder',
    systemPrompt: [
      'You are a senior software engineer. Produce COMPLETE, PRODUCTION-READY source code.',
      '',
      'CONTEXT ANALYSIS (mandatory first step):',
      '- Read the existing repository structure provided in the input.',
      '- Understand existing architecture, patterns, naming conventions, dependencies.',
      '- Your code MUST integrate with existing codebase — use same style, imports, patterns.',
      '',
      'OUTPUT RULES (strict):',
      '- Output ONLY fenced code blocks with file path: ```lang:path/to/file.ext',
      '- Every code block = FULL file content. Never output snippets or partial files.',
      '- Create ALL files needed. Include imports, error handling, edge cases.',
      '- For web projects: complete HTML with proper <head>, CSS links, JS imports.',
      '- For games: full game loop, rendering, input handling, state management.',
      '- For APIs: routes, middleware, validation, error responses.',
      '- Do NOT output explanations — only code blocks with complete files.',
      '',
      'QUALITY STANDARDS:',
      '- Production-ready: proper error handling, input validation, edge cases.',
      '- Well-structured: clear separation of concerns, modular design.',
      '- Complete: every file the project needs to actually run.',
      '- If modifying existing files, output the ENTIRE file with your changes applied.',
    ].join('\n'),
    temperature: 0.2,
    maxTokens: 16384,
    preferredProviders: ['github-copilot', 'openai', 'anthropic', 'ollama'],
  },
  tester: {
    label: 'Tester',
    systemPrompt: [
      'You are a senior QA engineer. Write COMPLETE, production-grade test suites.',
      '',
      'CONTEXT ANALYSIS (mandatory first step):',
      '- Read existing repo structure. Match testing framework if one exists.',
      '- Understand the code being tested from other agents\' output.',
      '',
      'OUTPUT RULES (strict):',
      '- Output ONLY fenced code blocks with file path: ```lang:path/to/test-file.ext',
      '- Every test file must be COMPLETE and runnable out of the box.',
      '- Include test config files (jest.config.js, vitest.config.ts, etc.) if needed.',
      '',
      'COVERAGE REQUIREMENTS:',
      '- Unit tests for all core functions/classes.',
      '- Integration tests for main user flows.',
      '- Edge cases: empty inputs, invalid data, boundary conditions.',
      '- At least 10 meaningful test cases per test file.',
    ].join('\n'),
    temperature: 0.2,
    maxTokens: 12288,
    preferredProviders: ['openai', 'github-copilot', 'anthropic', 'ollama'],
  },
  reviewer: {
    label: 'Reviewer',
    systemPrompt: [
      'You are a principal engineer doing a thorough code review.',
      '',
      'REVIEW PROCESS:',
      '1) Read ALL code from other agents carefully.',
      '2) Check: correctness, completeness, security, performance, error handling.',
      '3) Verify files work together — imports resolve, APIs match, types align.',
      '4) Check integration with existing repo code if applicable.',
      '',
      'For each issue, output the FIXED complete file: ```lang:path/to/file.ext',
      'If a file is correct, do NOT output it.',
      '',
      'After fixed files, provide a structured review summary:',
      '- Critical issues found and fixed',
      '- Warnings (non-blocking)',
      '- Overall quality assessment',
    ].join('\n'),
    temperature: 0.1,
    maxTokens: 12288,
    preferredProviders: ['openai', 'github-copilot', 'anthropic'],
  },
  security: {
    label: 'Security',
    systemPrompt: [
      'You are a principal security engineer. Perform a deep security audit.',
      '',
      'ANALYSIS SCOPE:',
      '- OWASP Top 10: injection, XSS, CSRF, auth flaws, misconfig, sensitive data exposure.',
      '- Dependency vulnerabilities: known CVEs in package versions.',
      '- Secrets: hardcoded keys, tokens, passwords, connection strings.',
      '- Input validation: all user inputs, API parameters, file uploads.',
      '- Auth/authz: session management, token handling, privilege escalation.',
      '',
      'OUTPUT RULES:',
      '- For each vulnerability found, output the FIXED complete file: ```lang:path/to/file.ext',
      '- After fixed files, provide a structured security report:',
      '  - Critical / High / Medium / Low issues with descriptions',
      '  - Recommendations for additional hardening',
    ].join('\n'),
    temperature: 0.1,
    maxTokens: 12288,
    preferredProviders: ['openai', 'github-copilot', 'anthropic'],
  },
  designer: {
    label: 'Designer',
    systemPrompt: [
      'You are a senior product designer who writes production CSS/HTML/component code.',
      '',
      'CONTEXT ANALYSIS: Read existing repo structure. Match existing design system if one exists.',
      '',
      'OUTPUT RULES (strict):',
      '- Output ONLY fenced code blocks with file path: ```lang:path/to/file.ext',
      '- Create COMPLETE CSS files with ALL styles — not just a few rules.',
      '- Include: layout, typography, colors, spacing, responsive breakpoints, animations, hover states.',
      '- For games: canvas styling, score displays, modals, transitions.',
      '- For apps: navigation, forms, buttons, cards, modals, toasts.',
      '- Modern CSS: custom properties, flexbox/grid, transitions.',
      '- Mobile-first responsive design with min-width media queries.',
      '- Dark/light theme support using CSS custom properties.',
    ].join('\n'),
    temperature: 0.35,
    maxTokens: 12288,
    preferredProviders: ['openai', 'github-copilot', 'anthropic'],
  },
  devops: {
    label: 'DevOps',
    systemPrompt: [
      'You are a senior DevOps / platform engineer.',
      '',
      'CONTEXT ANALYSIS: Read existing repo. Adapt to existing tooling (Docker, K8s, etc.)',
      '',
      'OUTPUT RULES (strict):',
      '- Output ONLY fenced code blocks with file path: ```lang:path/to/file.ext',
      '- Create COMPLETE config files: Dockerfile (multi-stage), docker-compose.yml, CI/CD pipelines.',
      '- Include: .github/workflows/ci.yml, .dockerignore, nginx.conf if needed.',
      '- Health checks, environment variable management, secrets handling.',
      '- Production-ready: caching, layer optimization, security scanning steps.',
    ].join('\n'),
    temperature: 0.2,
    maxTokens: 12288,
    preferredProviders: ['github-copilot', 'openai', 'anthropic'],
  },
  documenter: {
    label: 'Documenter',
    systemPrompt: [
      'You are a senior technical writer.',
      '',
      'OUTPUT RULES (strict):',
      '- Output ONLY fenced code blocks with file path: ```md:README.md or ```md:docs/setup.md',
      '- Create COMPREHENSIVE documentation:',
      '  - README.md: project overview, features, screenshots placeholder, quick start, full setup guide',
      '  - CONTRIBUTING.md: how to contribute, code style, PR process',
      '  - docs/: architecture overview, API reference, deployment guide',
      '- Include code examples, command-line snippets, configuration samples.',
      '- Structure with clear headings, table of contents for long docs.',
    ].join('\n'),
    temperature: 0.25,
    maxTokens: 12288,
    preferredProviders: ['github-copilot', 'openai', 'anthropic'],
  },
  refactorer: {
    label: 'Refactorer',
    systemPrompt: [
      'You are a senior software architect specializing in code refactoring.',
      '',
      'CONTEXT ANALYSIS: Read existing repo structure and code patterns.',
      '',
      'REFACTORING SCOPE:',
      '- Extract common patterns into reusable functions/components.',
      '- Improve naming, structure, separation of concerns.',
      '- Remove dead code, simplify complex logic.',
      '- Apply DRY, SOLID, KISS principles.',
      '',
      'OUTPUT RULES:',
      '- Output the COMPLETE refactored version: ```lang:path/to/file.ext',
      '- Only output files you actually changed.',
      '- Each block = FULL file content with all changes applied.',
      '- After code blocks, summarize what was refactored and why.',
    ].join('\n'),
    temperature: 0.2,
    maxTokens: 12288,
    preferredProviders: ['github-copilot', 'openai', 'anthropic', 'ollama'],
  },
  researcher: {
    label: 'Researcher',
    systemPrompt: [
      'You are a senior technical researcher and architect.',
      '',
      'RESEARCH METHODOLOGY:',
      '1) Analyze the problem domain thoroughly.',
      '2) Compare at least 3 technology options with pros/cons table.',
      '3) Consider: performance, bundle size, community, maintenance, learning curve.',
      '4) Provide a clear recommendation with justification.',
      '5) Include implementation approach: key libraries, patterns, architecture.',
      '',
      'Output a detailed, structured analysis (800+ words).',
      'Use tables for comparisons. Be specific with version numbers and metrics.',
    ].join('\n'),
    temperature: 0.35,
    maxTokens: 12288,
    preferredProviders: ['openai', 'github-copilot', 'anthropic'],
  },
};

const SPLITTER_PORTS = ['splitter-a', 'splitter-b', 'splitter-c', 'splitter-d', 'splitter-e'];
const MERGER_PORTS = ['merger-left', 'merger-right', 'merger-in-3', 'merger-in-4', 'merger-in-5'];

const createNode = (
  id: string,
  type: NodeType,
  position: { x: number; y: number },
  config: Record<string, unknown> = {},
  label?: string,
): FleetNode => ({
  id,
  type,
  label: label ?? NODE_TEMPLATES[type].label,
  description: NODE_TEMPLATES[type].description,
  position,
  ports: clonePorts(NODE_TEMPLATES[type].ports),
  config: { ...NODE_TEMPLATES[type].config, ...config },
  status: 'idle',
  progress: 0,
});

const connect = (id: string, source: string, sourcePort: string, target: string, targetPort: string, animated = false): FleetEdge => ({
  id,
  source,
  sourcePort,
  target,
  targetPort,
  animated,
});

const normalizeProviders = (providers: ProviderConfig[] | undefined): ProviderConfig[] => {
  const items = providers ?? [];
  const active = items.filter((p) => Boolean(p.apiKey) || p.type === 'ollama' || p.type === 'lmstudio' || p.type === 'vscode-local');
  if (active.length > 0) {
    return active;
  }
  return [{
    type: 'github-copilot',
    name: 'GitHub Copilot',
    models: ['claude-sonnet-4', 'gpt-4.1', 'gpt-4o', 'o3', 'o4-mini', 'gpt-4o-mini'],
    defaultModel: 'claude-sonnet-4',
  }];
};

const pickCandidateModel = (models: string[], candidates: string[]): string | undefined => {
  const lowerMap = new Map(models.map((m) => [m.toLowerCase(), m]));
  for (const candidate of candidates) {
    const direct = lowerMap.get(candidate.toLowerCase());
    if (direct) return direct;
    const byContains = models.find((m) => m.toLowerCase().includes(candidate.toLowerCase()));
    if (byContains) return byContains;
  }
  return undefined;
};

const pickModelForRole = (provider: ProviderConfig, role: string, tier: 'top' | 'regular'): string => {
  const models = Array.from(new Set([...(provider.models ?? []), ...(provider.defaultModel ? [provider.defaultModel] : [])])).filter(Boolean);
  if (models.length === 0) return 'gpt-4o';

  const roleTop = role === 'tester' || role === 'reviewer' || role === 'security'
    ? ['gpt-5.4', 'claude-opus-4.6', 'o3', 'o4-mini', 'gpt-4.1', 'gpt-4o', 'claude-sonnet-4.6', 'claude-sonnet-4', 'claude-opus-4']
    : ['gpt-5.4', 'claude-sonnet-4.6', 'claude-opus-4.6', 'claude-sonnet-4', 'gpt-4.1', 'gpt-4o', 'o4-mini', 'o3'];
  const roleRegular = ['gpt-4o-mini', 'gpt-4.1-mini', 'claude-3-5-haiku', 'qwen2.5-coder', 'llama3.2', 'codestral', 'deepseek-coder-v2'];

  const preferred = tier === 'top' ? roleTop : roleRegular;
  const fallback = tier === 'top' ? roleRegular : roleTop;

  return pickCandidateModel(models, preferred)
    ?? pickCandidateModel(models, fallback)
    ?? provider.defaultModel
    ?? models[0]
    ?? 'gpt-4o';
};

const pickProviderForRole = (role: string, providers: ProviderConfig[], index: number): ProviderConfig => {
  const profile = AGENT_SKILLS[role];
  const preferred = profile?.preferredProviders ?? [];
  for (const type of preferred) {
    const match = providers.find((p) => p.type === type);
    if (match) return match;
  }
  return providers[index % providers.length] ?? providers[0];
};

const buildAgentConfig = (agentId: string, providers: ProviderConfig[], index: number, tier: 'top' | 'regular'): Record<string, unknown> => {
  const profile = AGENT_SKILLS[agentId] ?? AGENT_SKILLS.coder;
  const provider = pickProviderForRole(agentId, providers, index);
  const model = pickModelForRole(provider, agentId, tier);

  return {
    agentId,
    provider: provider.type,
    model,
    systemPrompt: profile.systemPrompt,
    temperature: profile.temperature,
    maxTokens: profile.maxTokens,
  };
};

const ALL_ROLES = ['coder', 'tester', 'security', 'designer', 'devops', 'documenter', 'refactorer', 'researcher'] as const;

const hasKeyword = (text: string, list: string[]): boolean => list.some((item) => text.includes(item));

/**
 * Ask an LLM to pick the right specialists for the task.
 * Falls back to keyword heuristic if the API call fails.
 */
const chooseSpecialistsViaLLM = async (taskPrompt: string, providers: ProviderConfig[]): Promise<string[]> => {
  const provider = providers[0];
  if (!provider) return chooseSpecialistsFallback(taskPrompt);

  const models = [...(provider.models ?? []), ...(provider.defaultModel ? [provider.defaultModel] : [])];
  // Pick the fastest/cheapest model for this meta-call
  const cheapCandidates = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4.1', 'claude-sonnet-4', 'o4-mini'];
  const model = cheapCandidates.find((c) => models.some((m) => m.toLowerCase().includes(c.toLowerCase())))
    ?? provider.defaultModel ?? models[0] ?? 'gpt-4o-mini';

  const systemPrompt = [
    'You are a project staffing assistant. Given a task description, pick which specialist roles are needed.',
    `Available roles: ${ALL_ROLES.join(', ')}`,
    '',
    'Role descriptions:',
    '- coder: writes source code, implements features, builds the project',
    '- tester: writes tests, test configs',
    '- security: security audit, fixes vulnerabilities',
    '- designer: UI/UX, CSS, layouts, visual design, frontend styling',
    '- devops: Docker, CI/CD, deploy scripts, infrastructure',
    '- documenter: README, docs, guides, API reference',
    '- refactorer: code cleanup, restructuring',
    '- researcher: technology comparison, architecture decisions',
    '',
    'Rules:',
    '- Pick 2-5 roles that are ACTUALLY needed for this specific task.',
    '- ANY task that produces a user-facing app/game/site MUST include "designer".',
    '- ANY task that produces code MUST include "coder".',
    '- Only include "tester" if tests make sense for the deliverable.',
    '- Do NOT always pick the same set. Be specific to the task.',
    '',
    'Respond with ONLY a JSON array of role strings. Example: ["coder", "designer", "tester"]',
    'No explanations, no markdown, just the JSON array.',
  ].join('\n');

  try {
    const response = await complete({
      provider,
      model,
      messages: [{ role: 'user', content: `Task: ${taskPrompt}` }],
      systemPrompt,
      temperature: 0.1,
      maxTokens: 200,
    });

    // Parse the JSON array from response
    const text = response.content.trim();
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return chooseSpecialistsFallback(taskPrompt);

    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) return chooseSpecialistsFallback(taskPrompt);

    const valid = parsed
      .filter((r): r is string => typeof r === 'string' && ALL_ROLES.includes(r as typeof ALL_ROLES[number]))
      .slice(0, 5);

    if (valid.length === 0) return chooseSpecialistsFallback(taskPrompt);

    // Ensure at least coder is present
    if (!valid.includes('coder')) valid.unshift('coder');

    // Maintain consistent ordering
    const ordered = ALL_ROLES.filter((r) => valid.includes(r));
    return ordered.length > 0 ? [...ordered] : chooseSpecialistsFallback(taskPrompt);
  } catch {
    return chooseSpecialistsFallback(taskPrompt);
  }
};

/** Keyword-based fallback if LLM call fails. */
const chooseSpecialistsFallback = (taskPrompt: string): string[] => {
  const normalized = taskPrompt.toLowerCase();
  const selected = new Set<string>(['coder', 'tester']);

  if (hasKeyword(normalized, ['ui', 'ux', 'frontend', 'front', 'design', 'интерфейс', 'дизайн', 'фронт', 'игр', 'game', 'сайт', 'site', 'web', 'app', 'приложен'])) selected.add('designer');
  if (hasKeyword(normalized, ['security', 'auth', 'vuln', 'owasp', 'безопас', 'уязв'])) selected.add('security');
  if (hasKeyword(normalized, ['deploy', 'infra', 'docker', 'k8s', 'ci', 'cd', 'релиз', 'деплой'])) selected.add('devops');
  if (hasKeyword(normalized, ['doc', 'readme', 'guide', 'док', 'описан', 'докум'])) selected.add('documenter');
  if (hasKeyword(normalized, ['refactor', 'cleanup', 'техдолг', 'рефактор'])) selected.add('refactorer');
  if (hasKeyword(normalized, ['research', 'investigate', 'spike', 'исслед', 'сравн'])) selected.add('researcher');

  const ordered = [...ALL_ROLES];
  return ordered.filter((item) => selected.has(item)).slice(0, 5);
};

export async function createAutoTaskTemplate(taskPrompt: string, providersInput?: ProviderConfig[], repository?: string): Promise<FleetGraph> {
  const graphId = crypto.randomUUID();
  const providers = normalizeProviders(providersInput);
  const specialists = await chooseSpecialistsViaLLM(taskPrompt, providers);

  const laneGap = 340;
  const baseY = 400;
  const firstBranchY = baseY - ((specialists.length - 1) * laneGap) / 2;
  const mergerY = baseY;

  const nodes: FleetNode[] = [
    createNode('trigger-1', 'trigger', { x: 60, y: baseY }, {
      triggerType: 'manual',
      prompt: taskPrompt,
      repository: repository ?? '',
    }, 'Start'),
    createNode('planner-1', 'agent', { x: 440, y: baseY }, buildAgentConfig('planner', providers, 0, 'top'), AGENT_SKILLS.planner.label),
    createNode('splitter-1', 'splitter', {
      x: 820,
      y: baseY,
    }, {
      branchCount: specialists.length,
      branchLabels: specialists.map((role) => AGENT_SKILLS[role]?.label ?? role),
    }, 'Workstreams'),
  ];

  specialists.forEach((role, idx) => {
    nodes.push(
      createNode(
        `agent-${idx + 1}`,
        'agent',
        { x: 1240, y: firstBranchY + idx * laneGap },
        buildAgentConfig(role, providers, idx + 1, idx % 2 === 0 ? 'top' : 'regular'),
        AGENT_SKILLS[role]?.label ?? role,
      ),
    );
  });

  nodes.push(createNode('merger-1', 'merger', { x: 1680, y: mergerY }, { expectedInputs: specialists.length, strategy: 'all' }, 'Assemble'));
  nodes.push(createNode('reviewer-1', 'agent', { x: 2080, y: mergerY }, buildAgentConfig('reviewer', providers, 9, 'top'), AGENT_SKILLS.reviewer.label));
  nodes.push(createNode('output-1', 'output', { x: 2480, y: mergerY }, { outputType: 'handoff' }, 'Release'));

  const edges: FleetEdge[] = [
    connect('edge-1', 'trigger-1', 'trigger-out', 'planner-1', 'agent-in', true),
    connect('edge-2', 'planner-1', 'agent-out', 'splitter-1', 'splitter-in', true),
  ];

  specialists.forEach((_, idx) => {
    edges.push(connect(`edge-s-${idx + 1}`, 'splitter-1', SPLITTER_PORTS[idx], `agent-${idx + 1}`, 'agent-in'));
    edges.push(connect(`edge-m-${idx + 1}`, `agent-${idx + 1}`, 'agent-out', 'merger-1', MERGER_PORTS[idx]));
  });

  edges.push(connect('edge-r-1', 'merger-1', 'merger-out', 'reviewer-1', 'agent-in', true));
  edges.push(connect('edge-o-1', 'reviewer-1', 'agent-out', 'output-1', 'output-in', true));

  return {
    id: graphId,
    name: 'Auto Task Crew',
    description: 'Auto-generated workflow from task prompt with planner, specialists, reviewer, and output.',
    nodes,
    edges,
  };
}

export function createStarterTemplate(templateId: StarterTemplateId, options?: { providers?: ProviderConfig[]; taskPrompt?: string; repository?: string }): FleetGraph {
  const graphId = crypto.randomUUID();

  if (templateId === 'empty') {
    return {
      id: graphId,
      name: 'Empty workspace',
      nodes: [],
      edges: [],
    };
  }

  if (templateId === 'quick-fix') {
    const providers = normalizeProviders(options?.providers);
    return {
      id: graphId,
      name: 'Quick Fix',
      description: 'Trigger an agent, review the result, and emit the output.',
      nodes: [
        createNode('trigger-1', 'trigger', { x: 80, y: 160 }, { triggerType: 'manual', prompt: options?.taskPrompt ?? '' }, 'Start'),
        createNode('agent-1', 'agent', { x: 480, y: 140 }, buildAgentConfig('coder', providers, 0, 'top'), 'Coder'),
        createNode('output-1', 'output', { x: 920, y: 160 }, { outputType: 'markdown' }, 'Patch Summary'),
      ],
      edges: [
        connect('edge-1', 'trigger-1', 'trigger-out', 'agent-1', 'agent-in', true),
        connect('edge-2', 'agent-1', 'agent-out', 'output-1', 'output-in'),
      ],
    };
  }

  if (templateId === 'feature-squad') {
    const providers = normalizeProviders(options?.providers);
    return {
      id: graphId,
      name: 'Feature Squad',
      description: 'Plan, implement, review, and publish a feature flow.',
      nodes: [
        createNode('trigger-1', 'trigger', { x: 60, y: 280 }, { triggerType: 'manual', prompt: options?.taskPrompt ?? '' }, 'Kickoff'),
        createNode('agent-1', 'agent', { x: 440, y: 60 }, buildAgentConfig('planner', providers, 0, 'top'), 'Planner'),
        createNode('agent-2', 'agent', { x: 440, y: 440 }, buildAgentConfig('coder', providers, 1, 'regular'), 'Coder'),
        createNode('agent-3', 'agent', { x: 880, y: 280 }, buildAgentConfig('reviewer', providers, 2, 'top'), 'Reviewer'),
        createNode('output-1', 'output', { x: 1300, y: 280 }, { outputType: 'summary' }, 'Delivery'),
      ],
      edges: [
        connect('edge-1', 'trigger-1', 'trigger-out', 'agent-1', 'agent-in', true),
        connect('edge-2', 'trigger-1', 'trigger-out', 'agent-2', 'agent-in'),
        connect('edge-3', 'agent-1', 'agent-out', 'agent-3', 'agent-in'),
        connect('edge-4', 'agent-2', 'agent-out', 'agent-3', 'agent-in'),
        connect('edge-5', 'agent-3', 'agent-out', 'output-1', 'output-in', true),
      ],
    };
  }

  const providers = normalizeProviders(options?.providers);
  return {
    id: graphId,
    name: 'Fullstack Team',
    description: 'A broader multi-branch workflow for discovery, build, and delivery.',
    nodes: [
      createNode('trigger-1', 'trigger', { x: 40, y: 400 }, { triggerType: 'manual', prompt: options?.taskPrompt ?? '' }, 'Start'),
      createNode('agent-1', 'agent', { x: 420, y: 400 }, buildAgentConfig('planner', providers, 0, 'top'), 'Planner'),
      createNode('splitter-1', 'splitter', { x: 820, y: 400 }, { branchCount: 3, branchLabels: ['Frontend', 'Backend', 'QA'] }, 'Workstreams'),
      createNode('agent-2', 'agent', { x: 1240, y: 60 }, buildAgentConfig('designer', providers, 1, 'regular'), 'Frontend'),
      createNode('agent-3', 'agent', { x: 1240, y: 400 }, buildAgentConfig('coder', providers, 2, 'top'), 'Backend'),
      createNode('agent-4', 'agent', { x: 1240, y: 740 }, buildAgentConfig('tester', providers, 3, 'top'), 'QA'),
      createNode('merger-1', 'merger', { x: 1680, y: 400 }, { expectedInputs: 3 }, 'Assemble'),
      createNode('reviewer-1', 'agent', { x: 2080, y: 400 }, buildAgentConfig('reviewer', providers, 4, 'top'), 'Reviewer'),
      createNode('output-1', 'output', { x: 2480, y: 400 }, { outputType: 'handoff' }, 'Release'),
    ],
    edges: [
      connect('edge-1', 'trigger-1', 'trigger-out', 'agent-1', 'agent-in', true),
      connect('edge-2', 'agent-1', 'agent-out', 'splitter-1', 'splitter-in', true),
      connect('edge-3', 'splitter-1', 'splitter-a', 'agent-2', 'agent-in'),
      connect('edge-4', 'splitter-1', 'splitter-b', 'agent-3', 'agent-in'),
      connect('edge-5', 'splitter-1', 'splitter-c', 'agent-4', 'agent-in'),
      connect('edge-6', 'agent-2', 'agent-out', 'merger-1', 'merger-left'),
      connect('edge-7', 'agent-3', 'agent-out', 'merger-1', 'merger-right'),
      connect('edge-8', 'agent-4', 'agent-out', 'merger-1', 'merger-in-3'),
      connect('edge-9', 'merger-1', 'merger-out', 'reviewer-1', 'agent-in', true),
      connect('edge-10', 'reviewer-1', 'agent-out', 'output-1', 'output-in', true),
    ],
  };
}