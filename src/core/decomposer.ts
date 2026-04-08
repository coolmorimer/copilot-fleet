import * as vscode from 'vscode';
import { ModelsApi } from '../github/models';
import { FleetLogger } from '../utils/logger';
import { SubTask } from './state';

export interface DecompositionResult {
  tasks: SubTask[];
  summary: string;
}

export interface RepoContext {
  files: string[];
  readme?: string;
}

const SYSTEM_PROMPT = `You are a task decomposition engine for a GitHub Copilot cloud agent orchestrator.
Given a user request, break it down into independent sub-tasks that can be executed in parallel by separate coding agents.
Each sub-task will be assigned to a separate GitHub Copilot coding agent that creates code via a pull request.

Rules:
- You MUST produce exactly {maxTasks} sub-tasks. Split the work so that every agent has a meaningful job. If the task seems small, break it into finer-grained pieces (e.g. separate files, separate features, tests, docs, configs, CI).
- Each sub-task MUST have a detailed, self-contained description — an autonomous coding agent will ONLY see the issue text, not the rest of the plan. The description must be enough to implement the task fully.
- Each description MUST include:
  - What exact files to create or modify (full paths)
  - What classes/functions/interfaces to implement
  - Method signatures, key logic, and expected behavior
  - Any specific libraries or frameworks to use
  - How it connects to the overall project
- If the repository is empty or new, explicitly instruct the agent to CREATE files from scratch. Do NOT say "modify" for files that don't exist yet.
- Minimize dependencies between tasks. If dependency exists, specify it.
- Output valid JSON only, no markdown fences.
- Keep titles concise (under 60 chars).

{repoContext}

Output format:
{
  "summary": "Brief summary of the plan",
  "tasks": [
    {
      "id": "task-1",
      "title": "Short task title",
      "description": "DETAILED implementation instructions for the coding agent. Include exact file paths, class names, method signatures, logic description, and frameworks used.",
      "files": ["src/file1.ts", "src/file2.ts"],
      "dependsOn": []
    }
  ]
}`;

export class Decomposer {
  constructor(
    private readonly models: ModelsApi,
    private readonly logger: FleetLogger
  ) {}

  async decompose(
    prompt: string,
    maxTasks: number,
    token: vscode.CancellationToken,
    repoContext?: RepoContext
  ): Promise<DecompositionResult> {
    this.logger.info(`Decomposing task: "${prompt}" (max ${maxTasks} tasks)`);

    let contextBlock = '';
    if (repoContext) {
      if (repoContext.files.length === 0) {
        contextBlock = 'Repository state: The repository is EMPTY (only README.md exists). ALL files must be created from scratch. The agent MUST create the entire project structure.';
      } else {
        const fileTree = repoContext.files.slice(0, 100).join('\n');
        contextBlock = `Repository state: The repository already has ${repoContext.files.length} files. Existing file tree:\n${fileTree}`;
      }
      if (repoContext.readme) {
        contextBlock += `\n\nREADME.md contents:\n${repoContext.readme.slice(0, 1500)}`;
      }
    }

    const systemPrompt = SYSTEM_PROMPT
      .replace('{maxTasks}', String(maxTasks))
      .replace('{repoContext}', contextBlock ? `\nRepository context:\n${contextBlock}` : '');

    const response = await this.models.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      token
    );

    const parsed = this.parseResponse(response, maxTasks);
    this.logger.info(`Decomposition complete: ${parsed.tasks.length} tasks`);
    return parsed;
  }

  private parseResponse(raw: string, maxTasks: number): DecompositionResult {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();

    try {
      const data = JSON.parse(cleaned) as {
        summary: string;
        tasks: Array<{
          id: string;
          title: string;
          description: string;
          files: string[];
          dependsOn?: string[];
        }>;
      };

      const tasks: SubTask[] = data.tasks.slice(0, maxTasks).map((t, i) => ({
        id: t.id || `task-${i + 1}`,
        title: t.title,
        description: t.description,
        files: t.files ?? [],
        dependsOn: t.dependsOn ?? [],
        status: 'pending' as const,
      }));

      return { tasks, summary: data.summary ?? '' };
    } catch {
      this.logger.error('Failed to parse LLM response', raw);
      throw new Error('Failed to parse task decomposition from LLM response');
    }
  }
}
