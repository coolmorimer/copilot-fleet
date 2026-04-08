import * as vscode from 'vscode';

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  skills: string[];
  builtIn: boolean;
}

const CUSTOM_AGENTS_KEY = 'copilot-fleet.customAgents';
const CUSTOM_SKILLS_KEY = 'copilot-fleet.customSkills';

const BUILT_IN_SKILLS: AgentSkill[] = [
  { id: 'code', name: 'Написание кода', description: 'Создание и редактирование исходного кода', icon: 'code' },
  { id: 'test', name: 'Тестирование', description: 'Unit-тесты, интеграционные тесты', icon: 'beaker' },
  { id: 'docs', name: 'Документация', description: 'README, JSDoc, комментарии', icon: 'book' },
  { id: 'refactor', name: 'Рефакторинг', description: 'Улучшение структуры без изменения поведения', icon: 'wrench' },
  { id: 'review', name: 'Ревью кода', description: 'Проверка качества и безопасности', icon: 'eye' },
  { id: 'ci', name: 'CI/CD', description: 'Пайплайны, GitHub Actions, деплой', icon: 'server' },
  { id: 'design', name: 'UI/UX дизайн', description: 'Интерфейс, стили, компоненты', icon: 'paintcan' },
  { id: 'security', name: 'Безопасность', description: 'Аудит уязвимостей, OWASP', icon: 'shield' },
  { id: 'perf', name: 'Оптимизация', description: 'Производительность, профилирование', icon: 'dashboard' },
  { id: 'data', name: 'Данные', description: 'Миграции, схемы, SQL', icon: 'database' },
];

const BUILT_IN_AGENTS: AgentDefinition[] = [
  { id: 'coder', name: 'Coder', description: 'Пишет и модифицирует код', icon: 'code', color: '#3b82f6', skills: ['code', 'refactor'], builtIn: true },
  { id: 'tester', name: 'Tester', description: 'Создаёт тесты и покрытие', icon: 'beaker', color: '#10b981', skills: ['test', 'code'], builtIn: true },
  { id: 'documenter', name: 'Documenter', description: 'Документация и README', icon: 'book', color: '#8b5cf6', skills: ['docs'], builtIn: true },
  { id: 'architect', name: 'Architect', description: 'Структура проекта и конфиг', icon: 'project', color: '#f59e0b', skills: ['code', 'ci', 'refactor'], builtIn: true },
  { id: 'designer', name: 'Designer', description: 'UI/UX и визуал', icon: 'paintcan', color: '#ec4899', skills: ['design', 'code'], builtIn: true },
  { id: 'guardian', name: 'Guardian', description: 'Безопасность и ревью', icon: 'shield', color: '#ef4444', skills: ['security', 'review'], builtIn: true },
  { id: 'optimizer', name: 'Optimizer', description: 'Производительность', icon: 'dashboard', color: '#06b6d4', skills: ['perf', 'refactor'], builtIn: true },
];

export class AgentRegistry {
  private globalState: vscode.Memento | undefined;

  init(globalState: vscode.Memento): void {
    this.globalState = globalState;
  }

  getAllSkills(): AgentSkill[] {
    return [...BUILT_IN_SKILLS, ...this.getCustomSkills()];
  }

  getAllAgents(): AgentDefinition[] {
    return [...BUILT_IN_AGENTS, ...this.getCustomAgents()];
  }

  getAgent(id: string): AgentDefinition | undefined {
    return this.getAllAgents().find(a => a.id === id);
  }

  getSkill(id: string): AgentSkill | undefined {
    return this.getAllSkills().find(s => s.id === id);
  }

  getCustomAgents(): AgentDefinition[] {
    return this.globalState?.get<AgentDefinition[]>(CUSTOM_AGENTS_KEY, []) ?? [];
  }

  getCustomSkills(): AgentSkill[] {
    return this.globalState?.get<AgentSkill[]>(CUSTOM_SKILLS_KEY, []) ?? [];
  }

  async addCustomAgent(agent: Omit<AgentDefinition, 'builtIn'>): Promise<void> {
    const agents = this.getCustomAgents();
    agents.push({ ...agent, builtIn: false });
    await this.globalState?.update(CUSTOM_AGENTS_KEY, agents);
  }

  async removeCustomAgent(id: string): Promise<void> {
    const agents = this.getCustomAgents().filter(a => a.id !== id);
    await this.globalState?.update(CUSTOM_AGENTS_KEY, agents);
  }

  async addCustomSkill(skill: AgentSkill): Promise<void> {
    const skills = this.getCustomSkills();
    skills.push(skill);
    await this.globalState?.update(CUSTOM_SKILLS_KEY, skills);
  }

  async removeCustomSkill(id: string): Promise<void> {
    const skills = this.getCustomSkills().filter(s => s.id !== id);
    await this.globalState?.update(CUSTOM_SKILLS_KEY, skills);
  }

  /** Suggest agents for a given task description */
  suggestAgents(taskDescription: string, count: number): AgentDefinition[] {
    const all = this.getAllAgents();
    const lower = taskDescription.toLowerCase();
    const scored = all.map(agent => {
      let score = 0;
      const keywords: Record<string, string[]> = {
        coder: ['код', 'code', 'implement', 'реализ', 'создай', 'напиши', 'функц', 'класс', 'метод'],
        tester: ['тест', 'test', 'покрыт', 'coverage', 'assert', 'spec'],
        documenter: ['readme', 'документ', 'docs', 'описан', 'comment'],
        architect: ['структур', 'architecture', 'scaffold', 'проект', 'конфиг', 'config', 'setup'],
        designer: ['ui', 'ux', 'дизайн', 'design', 'стил', 'style', 'компонент', 'component', 'интерфейс'],
        guardian: ['безопасн', 'security', 'audit', 'vulnerab', 'owasp'],
        optimizer: ['оптимиз', 'performance', 'быстр', 'cache', 'профил'],
      };
      for (const kw of keywords[agent.id] ?? []) {
        if (lower.includes(kw)) { score += 2; }
      }
      // Default agents always have base score
      if (agent.id === 'coder') { score += 1; }
      return { agent, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, count).map(s => s.agent);
  }
}

export const agentRegistry = new AgentRegistry();
