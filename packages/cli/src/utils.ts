import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';

export const c = {
  bold: (s: string): string => `${BOLD}${s}${RESET}`,
  dim: (s: string): string => `${DIM}${s}${RESET}`,
  red: (s: string): string => `${RED}${s}${RESET}`,
  green: (s: string): string => `${GREEN}${s}${RESET}`,
  yellow: (s: string): string => `${YELLOW}${s}${RESET}`,
  blue: (s: string): string => `${BLUE}${s}${RESET}`,
  magenta: (s: string): string => `${MAGENTA}${s}${RESET}`,
  cyan: (s: string): string => `${CYAN}${s}${RESET}`,
};

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

export function printHeader(title: string, subtitle?: string): void {
  const line = '═'.repeat(Math.max(18, title.length + 4));
  console.log(`\n${c.cyan(line)}`);
  console.log(`${c.bold(c.cyan(`  ${title}`))}`);
  if (subtitle) {
    console.log(c.dim(subtitle));
  }
  console.log(c.cyan(line));
}

export function printTable(headers: readonly string[], rows: readonly (readonly string[])[]): void {
  const widths = headers.map((header, index) => {
    const values = rows.map((row) => stripAnsi(row[index] ?? ''));
    return Math.max(stripAnsi(header).length, ...values.map((value) => value.length));
  });

  const formatRow = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => padCell(cell ?? '', widths[index] ?? 0))
      .join('  ')
      .trimEnd();

  console.log(formatRow(headers.map((header) => c.bold(header))));
  console.log(formatRow(widths.map((width) => '─'.repeat(width))));
  for (const row of rows) {
    console.log(formatRow(row));
  }
}

export function timestamp(date = new Date()): string {
  return date.toLocaleTimeString('ru-RU', { hour12: false });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function info(message: string): void {
  console.log(`${c.cyan('ℹ INFO')} ${message}`);
}

export function success(message: string): void {
  console.log(`${c.green('✓ PASS')} ${message}`);
}

export function warn(message: string): void {
  console.log(`${c.yellow('⚠ WARN')} ${message}`);
}

export function failure(message: string): void {
  console.error(`${c.red('✗ FAIL')} ${message}`);
}

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function resolveWorkspaceRoot(startDir = process.cwd()): string {
  return resolve(startDir);
}

export function fleetPath(...parts: string[]): string {
  return resolve(resolveWorkspaceRoot(), '.fleet', ...parts);
}

export function repoPath(...parts: string[]): string {
  return resolve(resolveWorkspaceRoot(), ...parts);
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

export async function readTextIfExists(filePath: string): Promise<string | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }

  return readFile(filePath, 'utf8');
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  const content = await readTextIfExists(filePath);
  if (!content) {
    return null;
  }

  return JSON.parse(content) as T;
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureParentDir(filePath);
  await writeFile(filePath, content, 'utf8');
}

function padCell(value: string, width: number): string {
  const printable = stripAnsi(value);
  return `${value}${' '.repeat(Math.max(0, width - printable.length))}`;
}