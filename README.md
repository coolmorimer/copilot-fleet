# 🚀 Copilot Fleet — Cloud Agent Orchestrator

VS Code расширение для параллельной оркестрации облачных агентов GitHub Copilot.

Copilot Fleet разбивает задачу на подзадачи через LLM, создаёт Issues в целевом репозитории, назначает каждый на `copilot-swe-agent[bot]`, показывает прогресс в реальном времени и предоставляет визуальный редактор потока в стиле ComfyUI.

---

## ✨ Возможности

- **Chat Participant `@fleet`** — 10 команд прямо из чата VS Code
- **Визуальный Workflow Editor** — граф узлов (ComfyUI-стиль) с drag & drop, pan, zoom, bezier-рёбра
- **Полное ручное управление** — создание сессий, добавление/редактирование/удаление задач, назначение агентов вручную
- **7 встроенных агентов** с 10 навыками + кастомные агенты
- **DAG-зависимости** между подзадачами с автоматическим каскадным запуском
- **Мониторинг PR** — polling GitHub API с прогресс-баром
- **Merge управление** — merge отдельных PR или всех сразу из графа/чата
- **Amend на лету** — дополнение ТЗ задачи пока агент работает
- **Sync to Workspace** — одна кнопка для `git pull` результатов
- **Sidebar Dashboard** + **Status Bar** с live-обновлениями
- **SVG-иконки** — 30+ инлайн-иконок, без emoji, без внешних зависимостей

---

## 📸 Скриншоты

<!-- TODO: Добавить скриншоты -->

---

## ⚡ Установка

### Из исходного кода

```bash
git clone https://github.com/coolmorimer/copilot-fleet.git
cd copilot-fleet
npm install
npm run compile
# F5 в VS Code для запуска Extension Host
```

### Из VSIX

```bash
code --install-extension copilot-fleet-1.0.0.vsix
```

---

## 💬 Команды чата (@fleet)

| Команда | Описание |
|---------|----------|
| `@fleet <задача>` | Запустить агентов (= `/run`) |
| `@fleet /run <задача>` | Декомпозиция + запуск |
| `@fleet /plan <задача>` | Только план (dry run), открывает граф |
| `@fleet /status` | Статус текущей сессии |
| `@fleet /abort` | Остановить сессию |
| `@fleet /merge` | Смержить PR (все или по ID задачи) |
| `@fleet /amend <текст>` | Дополнить ТЗ всех активных задач |
| `@fleet /agents` | Список агентов и навыков |
| `@fleet /sync` | Синхронизировать workspace (`git pull`) |
| `@fleet /new` | Создать ручную сессию (без GitHub API) |
| `@fleet /reset` | Сбросить текущую сессию |

### Параметры

```
@fleet Рефакторинг проекта --agents 5 --repo coolmorimer/my-project
```

- `--agents N` — количество агентов (1–10)
- `--repo owner/repo` — целевой репозиторий

---

## 🎮 Command Palette

`Ctrl+Shift+P`:

| Команда | Описание |
|---------|----------|
| `Fleet: Запустить облачных агентов` | Интерактивный запуск |
| `Fleet: Показать план (Dry Run)` | Только декомпозиция |
| `Fleet: Статус сессии` | Текущий статус |
| `Fleet: Остановить сессию` | Abort |
| `Fleet: Редактор потока` | Открыть Workflow Editor |
| `Fleet: Новая ручная сессия` | Пустая сессия для ручного управления |
| `Fleet: Добавить задачу` | Добавить задачу в сессию |
| `Fleet: Завершить сессию принудительно` | Force-complete застрявшей сессии |
| `Fleet: Синхронизировать рабочую область` | `git pull` результатов |
| `Fleet: История сессий` | Архив прошлых сессий |

---

## 🔧 Workflow Editor

Визуальный редактор потока открывается автоматически при планировании или по команде.

### Структура графа

```
[Prompt] → [Декомпозиция] → [Task 1] → [Merge]
                            [Task 2] →
                            [Task 3] →
```

### Возможности

- **Drag & Drop** — перетаскивание узлов за заголовок
- **Pan & Zoom** — навигация колесом мыши и перетаскиванием фона
- **Detail Panel** — клик на узел открывает панель справа с полной информацией
- **Inline Agent Picker** — dropdown выбора агента прямо на узле (в режиме планирования)
- **Прогресс-бар** — визуальный индикатор выполнения с процентами
- **Bezier edges** — плавные рёбра между узлами, подсветка активных

### Ручное управление (в режиме планирования)

- **Создание сессии** — форма в пустом состоянии (промпт + репо + ветка)
- **+ Задача** — кнопка в тулбаре для добавления узла
- **Редактирование** — title, description, files, dependencies в detail panel
- **Удаление задачи** — кнопка в detail panel
- **Назначение агентов** — dropdown на каждом узле или в detail panel
- **Управление зависимостями** — добавление/удаление dep-связей
- **Завершить / Сбросить** — кнопки для управления застрявшими сессиями

---

## 🤖 Агенты

### Встроенные (7)

| Агент | Описание | Навыки |
|-------|----------|--------|
| **Coder** | Пишет и модифицирует код | code, refactor |
| **Tester** | Создаёт тесты и покрытие | test, code |
| **Documenter** | Документация и README | docs |
| **Architect** | Структура проекта и конфиг | code, ci, refactor |
| **Designer** | UI/UX и визуал | design, code |
| **Guardian** | Безопасность и ревью | security, review |
| **Optimizer** | Производительность | perf, refactor |

### Навыки (10)

`code` · `test` · `docs` · `refactor` · `review` · `ci` · `design` · `security` · `perf` · `data`

### Кастомные агенты

Добавляйте собственных агентов через `@fleet /agents` или programmatic API `agentRegistry.addCustomAgent()`.

---

## ⚙️ Настройки

`Ctrl+Shift+P` → **Preferences: Open Settings** → `copilot fleet`:

| Настройка | Описание | По умолчанию |
|-----------|----------|:---:|
| `copilot-fleet.agents.max` | Макс. параллельных агентов | `3` |
| `copilot-fleet.agents.concurrency` | Одновременных агентов | `3` |
| `copilot-fleet.agents.delayMs` | Задержка между запусками (мс) | `3000` |
| `copilot-fleet.preset` | Пресет | `squad` |
| `copilot-fleet.target.repo` | Целевой репозиторий | `""` |
| `copilot-fleet.target.branch` | Целевая ветка | `main` |
| `copilot-fleet.decomposer.model` | Модель для декомпозиции | `gpt-4o-mini` |
| `copilot-fleet.monitor.pollIntervalMs` | Интервал проверки PR (мс) | `30000` |
| `copilot-fleet.monitor.timeoutMs` | Таймаут ожидания PR (мс) | `3600000` |
| `copilot-fleet.pipeline.enableDependencies` | DAG-зависимости | `true` |
| `copilot-fleet.pipeline.requireApproval` | Подтверждение перед запуском | `true` |
| `copilot-fleet.pipeline.autoMergePRs` | Авто-мерж PR | `false` |

### Пресеты

| Пресет | Агентов | Задержка | Рекомендуется |
|--------|:---:|:---:|:---:|
| `solo` | 1 | — | Тестирование |
| `squad` | 2–3 | 5 сек | **Pro** |
| `platoon` | 4–6 | 3 сек | Pro+ |
| `fleet` | 7–10 | — | Enterprise |

---

## 🔐 Аутентификация

Расширение использует **VS Code Authentication API** — отдельный токен не нужен.

При первом запуске VS Code попросит авторизоваться через GitHub с правами `repo`.

---

## 📁 Структура проекта

```
src/
├── extension.ts              # Точка входа, регистрация команд
├── chat/
│   └── participant.ts        # @fleet chat participant (10 команд)
├── core/
│   ├── agents.ts             # Реестр агентов и навыков
│   ├── decomposer.ts         # LLM-декомпозиция задачи
│   ├── dispatcher.ts         # Создание Issues + назначение агента
│   ├── engine.ts             # Основной движок (plan, execute, CRUD)
│   ├── monitor.ts            # Polling PR-статусов
│   ├── pipeline.ts           # DAG-граф зависимостей
│   ├── scheduler.ts          # Batch-планировщик с concurrency
│   └── state.ts              # State machine сессии
├── github/
│   ├── api.ts                # GitHub REST API клиент
│   ├── issues.ts             # Операции с Issues
│   ├── models.ts             # VS Code LM API (декомпозиция)
│   └── pulls.ts              # Операции с Pull Requests
├── ui/
│   ├── icons.ts              # 30+ inline SVG иконок
│   ├── sidebar-provider.ts   # Sidebar Dashboard webview
│   ├── status-bar.ts         # Status Bar Item
│   └── workflow-panel.ts     # Визуальный Workflow Editor
└── utils/
    ├── config.ts             # Чтение настроек
    ├── logger.ts             # Output Channel логгер
    └── retry.ts              # Retry с экспоненциальным backoff
```

---

## 📊 Лимиты по подписке

| Подписка | Premium requests/мес | Рекомендуемый пресет |
|----------|:---:|:---:|
| GitHub Copilot Free | ограничено | `solo` (1 агент) |
| GitHub Copilot Pro | включены | `squad` (2–3 агента) |
| GitHub Copilot Pro+ | расширены | `platoon` (4–6 агентов) |
| GitHub Copilot Enterprise | безлимит | `fleet` (7–10 агентов) |

Каждый запуск агента = 1 premium request. Следите за лимитами.

---

## 🗺️ Roadmap

Смотри [TODO.md](TODO.md) для детального плана.

---

## 📄 Лицензия

MIT — см. [LICENSE](LICENSE).
- [ ] Multi-repo поддержка (оркестрация по нескольким репо)
- [ ] Telemetry dashboard (использование & статистика)

---

## 🛠️ Разработка

```bash
npm install
npm run compile   # Сборка
npm run watch     # Watch mode
npm run lint      # Проверка типов
npm run package   # Создать .vsix
```

Нажмите `F5` в VS Code для запуска Extension Development Host.

---

## 📄 License

[MIT](LICENSE)
