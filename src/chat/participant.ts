import * as vscode from 'vscode';
import { FleetEngine } from '../core/engine';
import { getConfig, getTargetRepo } from '../utils/config';
import { FleetSession, SubTask } from '../core/state';
import { agentRegistry } from '../core/agents';

export function registerFleetParticipant(
  context: vscode.ExtensionContext,
  engine: FleetEngine
): void {
  const handler = createHandler(engine);
  const participant = vscode.chat.createChatParticipant(
    'copilot-fleet.fleet',
    handler
  );

  participant.iconPath = vscode.Uri.joinPath(
    context.extensionUri, 'media', 'fleet-icon.svg'
  );

  context.subscriptions.push(participant);
}

function createHandler(
  engine: FleetEngine
): vscode.ChatRequestHandler {
  return async (request, _context, stream, token) => {
    const { command, prompt } = request;

    const agentsMatch = prompt.match(/--agents?\s+(\d+)/);
    const maxAgents = agentsMatch
      ? Math.min(Math.max(parseInt(agentsMatch[1], 10), 1), 10)
      : getConfig().maxAgents;
    const repoMatch = prompt.match(/--repo\s+([\w.-]+\/[\w.-]+)/);
    const repoOverride = repoMatch?.[1];
    const cleanPrompt = prompt
      .replace(/--agents?\s+\d+/, '')
      .replace(/--repo\s+[\w.-]+\/[\w.-]+/, '')
      .trim();

    switch (command) {
      case 'run':
        return handleRun(engine, cleanPrompt, maxAgents, stream, token, repoOverride);
      case 'plan':
        return handlePlan(engine, cleanPrompt, maxAgents, stream, token, repoOverride);
      case 'status':
        return handleStatus(engine, stream);
      case 'abort':
        return handleAbort(engine, stream);
      case 'merge':
        return handleMerge(engine, cleanPrompt, stream);
      case 'amend':
        return handleAmend(engine, cleanPrompt, stream);
      case 'agents':
        return handleAgents(stream);
      case 'sync':
        return handleSync(engine, stream);
      case 'new':
        return handleNew(engine, stream, cleanPrompt);
      case 'reset':
        return handleReset(engine, stream);
      default:
        if (cleanPrompt) {
          return handleRun(engine, cleanPrompt, maxAgents, stream, token, repoOverride);
        }
        stream.markdown(
          '**Copilot Fleet** — оркестратор облачных агентов\n\n' +
          'Команды:\n' +
          '- `/run` — запустить агентов\n' +
          '- `/plan` — показать план (dry run)\n' +
          '- `/status` — статус сессии\n' +
          '- `/abort` — остановить\n' +
          '- `/merge` — смержить PR (все или по ID)\n' +
          '- `/amend` — дополнить ТЗ задачи\n' +
          '- `/agents` — список агентов и навыков\n' +
          '- `/sync` — синхронизировать рабочую область (git pull)\n' +
          '- `/new` — создать ручную сессию (без GitHub API)\n' +
          '- `/reset` — сбросить текущую сессию\n\n' +
          'Пример: `@fleet Оптимизируй UI --agents 3`'
        );
        return {};
    }
  };
}

async function handleRun(
  engine: FleetEngine,
  prompt: string,
  maxAgents: number,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  repoOverride?: string
): Promise<vscode.ChatResult> {
  if (!prompt) {
    stream.markdown('❌ Укажите задачу. Пример: `@fleet Добавь тесты --agents 3`');
    return {};
  }

  let repo = repoOverride || await getTargetRepo();
  if (!repo) {
    repo = await vscode.window.showInputBox({
      prompt: 'Укажите целевой репозиторий (owner/repo)',
      placeHolder: 'coolmorimer/local_AI_techsupport',
      validateInput: v => v && v.includes('/') ? null : 'Формат: owner/repo',
    }) ?? '';
    if (!repo) {
      stream.markdown(
        '❌ Репозиторий не указан. Используйте `--repo owner/repo` или настройку `copilot-fleet.target.repo`'
      );
      return {};
    }
  }

  const config = getConfig();
  stream.markdown(
    `⚙️ **Конфигурация**\n` +
    `- Репозиторий: \`${repo}\`\n` +
    `- Ветка: \`${config.targetBranch}\` | Агентов: **${maxAgents}** | Пресет: ${config.preset}\n\n`
  );

  // Phase 1: Decompose
  stream.progress('Разбиваю задачу на подзадачи...');

  let session: FleetSession;
  try {
    session = await engine.plan(prompt, maxAgents, token, repo);
  } catch (err) {
    stream.markdown(`❌ Ошибка декомпозиции: ${err}`);
    return {};
  }

  // Show plan
  stream.markdown(renderPlan(session));

  // Open workflow graph
  stream.button({
    command: 'copilot-fleet.openWorkflow',
    title: 'Открыть редактор потока',
  });

  if (config.requireApproval) {
    stream.button({
      command: 'copilot-fleet.launch',
      title: 'Запустить агентов',
    });
    stream.markdown(
      '\n*Откройте редактор потока для визуального просмотра и назначения агентов. Нажмите «Запустить» когда будете готовы.*'
    );
    return {};
  }

  // Phase 2: Execute
  return executeAndReport(engine, stream, token);
}

async function handlePlan(
  engine: FleetEngine,
  prompt: string,
  maxAgents: number,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  repoOverride?: string
): Promise<vscode.ChatResult> {
  if (!prompt) {
    stream.markdown('❌ Укажите задачу для планирования.');
    return {};
  }

  let repo = repoOverride || await getTargetRepo();
  if (!repo) {
    repo = await vscode.window.showInputBox({
      prompt: 'Укажите целевой репозиторий (owner/repo)',
      placeHolder: 'coolmorimer/local_AI_techsupport',
      validateInput: v => v && v.includes('/') ? null : 'Формат: owner/repo',
    }) ?? '';
    if (!repo) {
      stream.markdown(
        '❌ Репозиторий не указан. Используйте `--repo owner/repo` или настройку `copilot-fleet.target.repo`'
      );
      return {};
    }
  }

  stream.progress('Составляю план...');

  try {
    const session = await engine.plan(prompt, maxAgents, token, repo);
    stream.markdown(renderPlan(session));
    stream.button({
      command: 'copilot-fleet.openWorkflow',
      title: 'Открыть редактор потока',
    });
    stream.markdown('\n*Это dry run — агенты не запущены. Откройте редактор для визуального просмотра графа.*');
  } catch (err) {
    stream.markdown(`❌ Ошибка: ${err}`);
  }

  return {};
}

function handleStatus(
  engine: FleetEngine,
  stream: vscode.ChatResponseStream
): vscode.ChatResult {
  const session = engine.session;
  if (!session) {
    stream.markdown('ℹ️ Нет активной сессии.');
    return {};
  }
  stream.markdown(renderStatus(session));
  return {};
}

function handleAbort(
  engine: FleetEngine,
  stream: vscode.ChatResponseStream
): vscode.ChatResult {
  const session = engine.session;
  if (!session) {
    stream.markdown('Нет активной сессии для остановки.');
    return {};
  }
  engine.abort();
  stream.markdown('Сессия остановлена.');
  return {};
}

function handleMerge(
  engine: FleetEngine,
  prompt: string,
  stream: vscode.ChatResponseStream
): vscode.ChatResult {
  const session = engine.session;
  if (!session) {
    stream.markdown('Нет активной сессии.');
    return {};
  }
  const prTasks = session.tasks.filter(t => t.status === 'pr_created' && t.prNumber);
  if (prTasks.length === 0) {
    stream.markdown('Нет PR для слияния.');
    return {};
  }

  const taskIdMatch = prompt.match(/(?:task|задач[аи])\s*(\S+)/i);
  if (taskIdMatch) {
    const task = session.tasks.find(t => t.id === taskIdMatch[1] || t.title.toLowerCase().includes(taskIdMatch[1].toLowerCase()));
    if (task) {
      stream.markdown(`Сливаю PR #${task.prNumber} для "${task.title}"...`);
      stream.button({ command: 'copilot-fleet.mergePR', title: `Merge PR #${task.prNumber}`, arguments: [task.id] });
    } else {
      stream.markdown('Задача не найдена. Доступные PR:\n');
      prTasks.forEach((t, i) => stream.markdown(`${i + 1}. **${t.title}** — PR #${t.prNumber}\n`));
    }
  } else {
    stream.markdown(`Доступно **${prTasks.length}** PR для слияния:\n\n`);
    prTasks.forEach((t, i) => {
      stream.markdown(`${i + 1}. **${t.title}** — PR #${t.prNumber}\n`);
    });
    stream.button({ command: 'copilot-fleet.mergeAll', title: 'Смержить все PR' });
  }
  return {};
}

async function handleAmend(
  engine: FleetEngine,
  prompt: string,
  stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
  const session = engine.session;
  if (!session) {
    stream.markdown('Нет активной сессии.');
    return {};
  }
  if (!prompt) {
    stream.markdown('Укажите дополнение. Пример: `@fleet /amend добавь обработку ошибок`');
    return {};
  }

  const activeTasks = session.tasks.filter(t => t.status === 'dispatched' || t.status === 'working');
  if (activeTasks.length === 0) {
    stream.markdown('Нет активных задач для дополнения.');
    return {};
  }

  stream.markdown(`Дополняю **${activeTasks.length}** активных задач:\n\n`);
  for (const task of activeTasks) {
    try {
      await engine.amendTask(task.id, prompt);
      stream.markdown(`- **${task.title}** — дополнено\n`);
    } catch (err) {
      stream.markdown(`- **${task.title}** — ошибка: ${err}\n`);
    }
  }
  return {};
}

async function handleSync(
  engine: FleetEngine,
  stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
  try {
    stream.progress('Синхронизация рабочей области (git pull)...');
    const result = await engine.syncToWorkspace();
    stream.markdown(`Синхронизация завершена: \`${result}\``);
  } catch (err) {
    stream.markdown(`Ошибка синхронизации: ${err}`);
  }
  return {};
}

async function handleNew(
  engine: FleetEngine,
  stream: vscode.ChatResponseStream,
  prompt: string
): Promise<vscode.ChatResult> {
  const repoMatch = prompt.match(/--repo\s+([\w.-]+\/[\w.-]+)/);
  const repoOverride = repoMatch?.[1];
  const cleanPrompt = prompt.replace(/--repo\s+[\w.-]+\/[\w.-]+/, '').trim();

  let repo = repoOverride || await getTargetRepo();
  if (!repo) {
    repo = await vscode.window.showInputBox({
      prompt: 'Укажите целевой репозиторий (owner/repo)',
      placeHolder: 'coolmorimer/my-project',
      validateInput: v => v && v.includes('/') ? null : 'Формат: owner/repo',
    }) ?? '';
  }

  const session = engine.createManualSession(cleanPrompt || undefined, repo || undefined);
  stream.markdown(
    `**Ручная сессия создана**\n\n` +
    `- Репозиторий: \`${session.repo}\`\n` +
    `- Ветка: \`${session.branch}\`\n\n` +
    `Откройте редактор потока для добавления задач вручную.`
  );
  stream.button({
    command: 'copilot-fleet.openWorkflow',
    title: 'Открыть редактор потока',
  });
  return {};
}

function handleReset(
  engine: FleetEngine,
  stream: vscode.ChatResponseStream
): vscode.ChatResult {
  const session = engine.session;
  if (!session) {
    stream.markdown('Нет активной сессии для сброса.');
    return {};
  }
  const status = session.status;
  const taskCount = session.tasks.length;
  engine.reset();
  stream.markdown(
    `Сессия сброшена (была в статусе **${status}**, ${taskCount} задач).\n\n` +
    `Используйте \`@fleet /plan\` или \`@fleet /new\` для нового запуска.`
  );
  return {};
}

function handleAgents(
  stream: vscode.ChatResponseStream
): vscode.ChatResult {
  const agents = agentRegistry.getAllAgents();
  const skills = agentRegistry.getAllSkills();

  stream.markdown('**Доступные агенты:**\n\n');
  agents.forEach(a => {
    const skillNames = a.skills.map(sid => {
      const sk = skills.find(s => s.id === sid);
      return sk ? sk.name : sid;
    }).join(', ');
    stream.markdown(`- **${a.name}** — ${a.description} _(${skillNames})_${a.builtIn ? '' : ' `custom`'}\n`);
  });

  stream.markdown('\n**Навыки:** ' + skills.map(s => `\`${s.name}\``).join(', ') + '\n');
  return {};
}

async function executeAndReport(
  engine: FleetEngine,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  stream.progress('Запускаю облачных агентов...');

  // Track task status changes in real-time
  const taskStatuses = new Map<string, string>();
  const onStateChange = (session: FleetSession | undefined) => {
    if (!session) { return; }
    for (const task of session.tasks) {
      const prev = taskStatuses.get(task.id);
      if (prev !== task.status) {
        taskStatuses.set(task.id, task.status);
        if (prev) { // skip initial set
          const icon = statusIcons[task.status] ?? '❓';
          const detail = task.issueNumber ? ` (Issue #${task.issueNumber})` : '';
          stream.progress(`${icon} ${task.title}: ${statusLabels[task.status] ?? task.status}${detail}`);
        }
      }
    }
  };
  engine.onStateChange(onStateChange);

  try {
    const session = await engine.execute(token);
    stream.markdown(renderStatus(session));
  } catch (err) {
    stream.markdown(`❌ Ошибка выполнения: ${err}`);
  }

  return {};
}

const statusIcons: Record<string, string> = {
  pending: '⏳', dispatched: '📤', working: '🔄',
  pr_created: '✅', completed: '✅', failed: '❌', aborted: '🛑',
};
const statusLabels: Record<string, string> = {
  pending: 'ожидание', dispatched: 'назначено', working: 'в работе',
  pr_created: 'PR создан', completed: 'завершено', failed: 'ошибка', aborted: 'остановлено',
};

function renderPlan(session: FleetSession): string {
  const lines = [`📋 **План** (${session.tasks.length} подзадач):\n`];

  session.tasks.forEach((task, i) => {
    const deps = task.dependsOn.length > 0
      ? ` _(зависит от: ${task.dependsOn.join(', ')})_`
      : '';
    const files = task.files.length > 0
      ? `\n   Файлы: ${task.files.map(f => `\`${f}\``).join(', ')}`
      : '';
    lines.push(`${i + 1}. **${task.title}**${deps}${files}`);
  });

  return lines.join('\n');
}

function renderStatus(session: FleetSession): string {
  const icons: Record<string, string> = {
    pending: '⏳',
    dispatched: '📤',
    working: '🚀',
    pr_created: '✅',
    completed: '✅',
    failed: '❌',
    aborted: '🛑',
  };

  const done = session.tasks.filter(
    t => t.status === 'completed' || t.status === 'pr_created'
  ).length;

  const taskLines = session.tasks.map((t, i) => {
    const icon = icons[t.status] ?? '❓';
    const issue = t.issueNumber ? ` → Issue #${t.issueNumber}` : '';
    const pr = t.prNumber ? ` → PR #${t.prNumber}` : '';
    return `${i + 1}. ${icon} ${t.title}${issue}${pr}`;
  });

  const elapsed = session.completedAt
    ? formatDuration(session.completedAt - session.startedAt)
    : formatDuration(Date.now() - session.startedAt);

  return [
    `📊 **Статус: ${session.status}** — ${done}/${session.tasks.length}\n`,
    ...taskLines,
    '',
    `⏱️ Время: ${elapsed}`,
  ].join('\n');
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} мин ${s} сек` : `${s} сек`;
}
