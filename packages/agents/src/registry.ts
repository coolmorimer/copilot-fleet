import type { AgentDefinition } from '@copilot-fleet/shared';

import { createCoderAgent } from './builtin/coder.js';
import { createDesignerAgent } from './builtin/designer.js';
import { createDevOpsAgent } from './builtin/devops.js';
import { createDocumenterAgent } from './builtin/documenter.js';
import { createPlannerAgent } from './builtin/planner.js';
import { createRefactorerAgent } from './builtin/refactorer.js';
import { createResearcherAgent } from './builtin/researcher.js';
import { createReviewerAgent } from './builtin/reviewer.js';
import { createSecurityAgent } from './builtin/security.js';
import { createTesterAgent } from './builtin/tester.js';

const builtinFactories = [
  createCoderAgent,
  createReviewerAgent,
  createTesterAgent,
  createRefactorerAgent,
  createDocumenterAgent,
  createSecurityAgent,
  createDesignerAgent,
  createDevOpsAgent,
  createResearcherAgent,
  createPlannerAgent,
];

const cloneAgent = (agent: AgentDefinition): AgentDefinition => ({
  ...agent,
  parameters: { ...agent.parameters },
  files: agent.files
    ? {
        include: agent.files.include ? [...agent.files.include] : undefined,
        exclude: agent.files.exclude ? [...agent.files.exclude] : undefined,
      }
    : undefined,
  hooks: agent.hooks ? { ...agent.hooks } : undefined,
  labels: agent.labels ? [...agent.labels] : undefined,
});

export class AgentRegistry {
  private agents: Map<string, AgentDefinition>;

  constructor() {
    this.agents = new Map<string, AgentDefinition>();
  }

  register(agent: AgentDefinition): void {
    this.agents.set(agent.id, cloneAgent(agent));
  }

  unregister(id: string): boolean {
    return this.agents.delete(id);
  }

  get(id: string): AgentDefinition | undefined {
    const agent = this.agents.get(id);
    return agent ? cloneAgent(agent) : undefined;
  }

  getAll(): AgentDefinition[] {
    return Array.from(this.agents.values(), (agent) => cloneAgent(agent));
  }

  getBuiltins(): AgentDefinition[] {
    return this.getAll().filter((agent) => agent.builtin);
  }

  getCustom(): AgentDefinition[] {
    return this.getAll().filter((agent) => !agent.builtin);
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }

  count(): number {
    return this.agents.size;
  }

  loadBuiltins(): void {
    for (const createBuiltin of builtinFactories) {
      const agent = createBuiltin();
      this.register(agent);
    }
  }

  search(query: string): AgentDefinition[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return this.getAll();
    }

    return this.getAll().filter((agent) => {
      const haystack = [agent.id, agent.name, agent.displayName, agent.description, ...(agent.labels ?? [])]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }
}