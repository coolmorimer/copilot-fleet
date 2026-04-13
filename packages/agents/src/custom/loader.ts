import { DEFAULT_AGENT_PARAMETERS, validateAgentDefinition as validateSharedAgentDefinition } from '@copilot-fleet/shared';
import type { AgentDefinition, AgentHooks, AgentParameters, FileFilter, ProviderType } from '@copilot-fleet/shared';

type ParsedObject = Record<string, unknown>;
type DirectoryEntry = { name: string; isDirectory(): boolean; isFile(): boolean };
type ReaddirFn = (path: string, options: { withFileTypes: true }) => Promise<DirectoryEntry[]>;
type JoinFn = (...parts: string[]) => string;

const providerTypes = new Set<ProviderType>([
  'github-copilot',
  'openai',
  'anthropic',
  'ollama',
  'lmstudio',
  'custom-api',
  'vscode-local',
]);

const loadFileSystem = new Function('return import("fs/promises")') as () => Promise<{ readdir: ReaddirFn }>;
const loadPath = new Function('return import("path")') as () => Promise<{ join: JoinFn }>;

const countIndent = (line: string): number => line.length - line.trimStart().length;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const unquote = (value: string): string => {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
};

const parseScalar = (value: string): unknown => {
  const normalized = unquote(value.trim());
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  if (normalized.length > 0 && /^-?\d+(\.\d+)?$/.test(normalized)) {
    return Number(normalized);
  }
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    const items = normalized
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => String(parseScalar(item)));
    return items;
  }
  return normalized;
};

const nextRelevantIndex = (lines: string[], startIndex: number): number => {
  for (let index = startIndex; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? '';
    if (trimmed.length > 0 && !trimmed.startsWith('#')) {
      return index;
    }
  }
  return -1;
};

const parseArray = (lines: string[], startIndex: number, indent: number): [unknown[], number] => {
  const values: unknown[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const rawLine = lines[index] ?? '';
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      index += 1;
      continue;
    }

    const lineIndent = countIndent(rawLine);
    if (lineIndent < indent || !trimmed.startsWith('- ')) {
      break;
    }

    values.push(parseScalar(trimmed.slice(2)));
    index += 1;
  }

  return [values, index];
};

const parseMultiline = (lines: string[], startIndex: number, indent: number): [string, number] => {
  const values: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const rawLine = lines[index] ?? '';
    const trimmed = rawLine.trim();
    const lineIndent = countIndent(rawLine);

    if (trimmed.length === 0) {
      values.push('');
      index += 1;
      continue;
    }
    if (lineIndent < indent) {
      break;
    }

    values.push(rawLine.slice(indent));
    index += 1;
  }

  return [values.join('\n').trimEnd(), index];
};

const parseObject = (lines: string[], startIndex: number, indent: number): [ParsedObject, number] => {
  const result: ParsedObject = {};
  let index = startIndex;

  while (index < lines.length) {
    const rawLine = lines[index] ?? '';
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      index += 1;
      continue;
    }

    const lineIndent = countIndent(rawLine);
    if (lineIndent < indent) {
      break;
    }
    if (lineIndent > indent) {
      throw new Error(`Invalid indentation near line ${index + 1}.`);
    }

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) {
      throw new Error(`Invalid YAML entry near line ${index + 1}.`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (rawValue === '|') {
      const [value, nextIndex] = parseMultiline(lines, index + 1, indent + 2);
      result[key] = value;
      index = nextIndex;
      continue;
    }

    if (rawValue.length > 0) {
      result[key] = parseScalar(rawValue);
      index += 1;
      continue;
    }

    const childIndex = nextRelevantIndex(lines, index + 1);
    if (childIndex === -1 || countIndent(lines[childIndex] ?? '') <= indent) {
      result[key] = '';
      index += 1;
      continue;
    }

    if ((lines[childIndex] ?? '').trim().startsWith('- ')) {
      const [value, nextIndex] = parseArray(lines, childIndex, indent + 2);
      result[key] = value;
      index = nextIndex;
      continue;
    }

    const [value, nextIndex] = parseObject(lines, index + 1, indent + 2);
    result[key] = value;
    index = nextIndex;
  }

  return [result, index];
};

const toStringArray = (value: unknown): string[] | undefined => {
  if (typeof value === 'undefined') {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return undefined;
  }
  return [...value];
};

const toParameters = (value: unknown): AgentParameters => {
  const parameters = isRecord(value) ? value : {};
  return {
    temperature: typeof parameters.temperature === 'number' ? parameters.temperature : DEFAULT_AGENT_PARAMETERS.temperature,
    maxTokens: typeof parameters.maxTokens === 'number' ? parameters.maxTokens : DEFAULT_AGENT_PARAMETERS.maxTokens,
    timeout: typeof parameters.timeout === 'number' ? parameters.timeout : DEFAULT_AGENT_PARAMETERS.timeout,
  };
};

const toFiles = (value: unknown): FileFilter | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const include = toStringArray(value.include);
  const exclude = toStringArray(value.exclude);
  return include || exclude ? { include, exclude } : undefined;
};

const toHooks = (value: unknown): AgentHooks | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const before = typeof value.before === 'string' ? value.before : undefined;
  const after = typeof value.after === 'string' ? value.after : undefined;
  return before || after ? { before, after } : undefined;
};

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeDefinition = (definition: Partial<AgentDefinition>): Partial<AgentDefinition> => ({
  ...definition,
  id: definition.id ?? (definition.name ? slugify(definition.name) : undefined),
  builtin: definition.builtin ?? false,
  parameters: toParameters(definition.parameters),
  files: toFiles(definition.files),
  hooks: toHooks(definition.hooks),
  labels: definition.labels ? [...definition.labels] : undefined,
});

export function parseAgentYAML(content: string): Partial<AgentDefinition> {
  const [parsed] = parseObject(content.replace(/^---\s*$/gm, '').split(/\r?\n/), 0, 0);

  return {
    id: typeof parsed.id === 'string' ? parsed.id : undefined,
    name: typeof parsed.name === 'string' ? parsed.name : undefined,
    displayName: typeof parsed.displayName === 'string' ? parsed.displayName : undefined,
    description: typeof parsed.description === 'string' ? parsed.description : undefined,
    icon: typeof parsed.icon === 'string' ? parsed.icon : undefined,
    color: typeof parsed.color === 'string' ? parsed.color : undefined,
    provider: typeof parsed.provider === 'string' ? (parsed.provider as ProviderType) : undefined,
    model: typeof parsed.model === 'string' ? parsed.model : undefined,
    fallbackModel: typeof parsed.fallbackModel === 'string' ? parsed.fallbackModel : undefined,
    systemPrompt: typeof parsed.systemPrompt === 'string' ? parsed.systemPrompt : undefined,
    parameters: isRecord(parsed.parameters) ? toParameters(parsed.parameters) : undefined,
    files: isRecord(parsed.files) ? (parsed.files as FileFilter) : undefined,
    hooks: isRecord(parsed.hooks) ? (parsed.hooks as AgentHooks) : undefined,
    labels: toStringArray(parsed.labels),
    builtin: typeof parsed.builtin === 'boolean' ? parsed.builtin : undefined,
  };
}

export function validateAgentDefinition(def: Partial<AgentDefinition>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof def.id !== 'string' || def.id.length === 0) {
    errors.push('Agent definition id must be a non-empty string.');
  }
  if (typeof def.name !== 'string' || def.name.length === 0) {
    errors.push('Agent definition name must be a non-empty string.');
  }
  if (typeof def.displayName !== 'string' || def.displayName.length === 0) {
    errors.push('Agent definition displayName must be a non-empty string.');
  }
  if (typeof def.description !== 'string' || def.description.length === 0) {
    errors.push('Agent definition description must be a non-empty string.');
  }
  if (typeof def.provider !== 'string' || !providerTypes.has(def.provider)) {
    errors.push('Agent definition provider is invalid.');
  }
  if (typeof def.model !== 'string' || def.model.length === 0) {
    errors.push('Agent definition model must be a non-empty string.');
  }
  if (typeof def.systemPrompt !== 'string' || def.systemPrompt.length === 0) {
    errors.push('Agent definition systemPrompt must be a non-empty string.');
  }
  if (typeof def.builtin !== 'boolean') {
    errors.push('Agent definition builtin must be a boolean.');
  }
  if (!def.parameters) {
    errors.push('Agent definition parameters are required.');
  } else {
    if (typeof def.parameters.temperature !== 'number' || def.parameters.temperature < 0 || def.parameters.temperature > 2) {
      errors.push('Agent definition.parameters.temperature must be between 0 and 2.');
    }
    if (typeof def.parameters.maxTokens !== 'number' || def.parameters.maxTokens <= 0) {
      errors.push('Agent definition.parameters.maxTokens must be a positive number.');
    }
    if (typeof def.parameters.timeout !== 'number' || def.parameters.timeout <= 0) {
      errors.push('Agent definition.parameters.timeout must be a positive number.');
    }
  }

  if (typeof def.labels !== 'undefined') {
    if (!Array.isArray(def.labels) || def.labels.some((label: string) => typeof label !== 'string')) {
      errors.push('Agent definition labels must be a string array when provided.');
    }
  }
  if (typeof def.files !== 'undefined') {
    if (!isRecord(def.files)) {
      errors.push('Agent definition files must be an object when provided.');
    } else {
      const include = toStringArray(def.files.include);
      const exclude = toStringArray(def.files.exclude);
      if (typeof def.files.include !== 'undefined' && !include) {
        errors.push('Agent definition files.include must be a string array when provided.');
      }
      if (typeof def.files.exclude !== 'undefined' && !exclude) {
        errors.push('Agent definition files.exclude must be a string array when provided.');
      }
    }
  }
  if (typeof def.hooks !== 'undefined') {
    if (!isRecord(def.hooks)) {
      errors.push('Agent definition hooks must be an object when provided.');
    } else {
      if (typeof def.hooks.before !== 'undefined' && typeof def.hooks.before !== 'string') {
        errors.push('Agent definition hooks.before must be a string when provided.');
      }
      if (typeof def.hooks.after !== 'undefined' && typeof def.hooks.after !== 'string') {
        errors.push('Agent definition hooks.after must be a string when provided.');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function loadAgentFromString(content: string, format: 'yaml' | 'json'): AgentDefinition {
  const parsed = format === 'json' ? (JSON.parse(content) as Partial<AgentDefinition>) : parseAgentYAML(content);
  const normalized = normalizeDefinition(parsed);
  const validation = validateAgentDefinition(normalized);

  if (!validation.valid) {
    throw new Error(`Invalid agent definition: ${validation.errors.join('; ')}`);
  }

  const sharedValidation = validateSharedAgentDefinition(normalized);
  if (!sharedValidation.valid) {
    throw new Error(`Invalid agent definition: ${sharedValidation.errors.join('; ')}`);
  }

  return normalized as AgentDefinition;
}

export async function discoverAgentFiles(dirPath: string): Promise<string[]> {
  try {
    const [{ readdir }, { join }] = await Promise.all([loadFileSystem(), loadPath()]);
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry: { name: string; isDirectory(): boolean; isFile(): boolean }) => {
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return discoverAgentFiles(fullPath);
        }
        if (entry.isFile() && /\.(json|ya?ml)$/i.test(entry.name)) {
          return [fullPath];
        }
        return [];
      }),
    );

    return files.flat().sort((left: string, right: string) => left.localeCompare(right));
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}