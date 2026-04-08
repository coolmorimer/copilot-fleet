# 🚀 Copilot Fleet — Cloud Agent Orchestrator

Запускайте параллельные облачные агенты GitHub Copilot прямо из чата VS Code.

Copilot Fleet разбивает задачу на подзадачи через LLM, создаёт Issues в целевом репозитории, назначает каждый на `copilot-swe-agent[bot]` и показывает прогресс в реальном времени.

---

## 📸 Скриншоты

<!-- TODO: Добавить скриншоты после первого запуска -->

| Chat Participant | Sidebar Dashboard | Status Bar |
|:---:|:---:|:---:|
| ![Chat](docs/screenshots/chat.png) | ![Sidebar](docs/screenshots/sidebar.png) | ![Status](docs/screenshots/statusbar.png) |

---

## ⚡ Установка

### Из VS Code Marketplace

1. Откройте VS Code
2. `Ctrl+Shift+X` → поиск **"Copilot Fleet"**
3. Нажмите **Install**

### Из VSIX

```bash
code --install-extension copilot-fleet-1.0.0.vsix
```

### Из исходного кода

```bash
git clone https://github.com/coolmorimer/copilot-fleet.git
cd copilot-fleet
npm install
npm run compile
# F5 в VS Code для запуска Extension Host
```

---

## ⚙️ Настройка количества агентов

### Через VS Code Settings

`Ctrl+Shift+P` → **Preferences: Open Settings** → введите `copilot fleet`:

| Настройка | Описание | По умолчанию |
|-----------|----------|:---:|
| `copilot-fleet.agents.max` | Макс. параллельных агентов | `3` |
| `copilot-fleet.agents.concurrency` | Одновременных агентов | `3` |
| `copilot-fleet.agents.delayMs` | Задержка между запусками (мс) | `3000` |
| `copilot-fleet.preset` | Пресет | `squad` |
| `copilot-fleet.target.repo` | Целевой репозиторий (`owner/repo`) | `""` |
| `copilot-fleet.target.branch` | Целевая ветка | `main` |
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

### Через параметр `--agents` в чате

```
@fleet Рефакторинг проекта --agents 5
```

`--agents` имеет приоритет над настройками.

---

## 💬 Использование из чата (@fleet)

```
@fleet Оптимизируй UI, добавь тесты, поправь звуки --agents 3
```

### Команды

| Команда | Описание |
|---------|----------|
| `@fleet <задача>` | Запустить агентов (= `/run`) |
| `@fleet /run <задача>` | Запустить агентов |
| `@fleet /plan <задача>` | Показать план без запуска (dry run) |
| `@fleet /status` | Показать статус текущей сессии |
| `@fleet /abort` | Остановить текущую сессию |

### Пример

```
User: @fleet Оптимизируй UI, добавь тесты, поправь звуки --agents 3

Fleet:
  ⚙️ Конфигурация
  Репозиторий: coolmorimer/my-app
  Ветка: main | Агентов: 3 | Пресет: squad

  📋 План (3 подзадачи):
  1. 🎨 Оптимизировать UI компоненты
  2. 🧪 Добавить тесты
  3. 🔊 Исправить аудио-модуль

  [Запустить агентов]

  🚀 Запуск...
  ✅ Issue #42 создан — агент работает
  ✅ Issue #43 создан — агент работает
  ✅ Issue #44 создан — агент работает

  📊 Итого: 3/3 ✅ — 3 мин 12 сек
```

---

## 🎮 Использование из Command Palette

`Ctrl+Shift+P` (или `Cmd+Shift+P` на macOS):

| Команда | Описание |
|---------|----------|
| `Fleet: Запустить облачных агентов` | Запуск через интерактивный ввод |
| `Fleet: Показать план (Dry Run)` | Plan без запуска |
| `Fleet: Статус сессии` | Текущий статус |
| `Fleet: Остановить сессию` | Abort |
| `Fleet: Открыть дашборд` | Фокус на Sidebar |
| `Fleet: История сессий` | Архив прошлых сессий |

---

## 📊 Sidebar Dashboard

Кликните иконку 🚀 в Activity Bar (левая панель VS Code):

- Текущая сессия: задача, статус, прогресс
- Список подзадач с иконками состояния (⏳🚀✅❌)
- Для каждой подзадачи: Issue → PR (кликабельные ссылки)
- Кнопки: Запустить / Остановить / История
- Таймер работы
- Адаптация к тёмной/светлой теме VS Code

---

## 📋 Status Bar

Нижняя панель VS Code:

| Состояние | Вид |
|-----------|-----|
| Нет сессии | `$(rocket) Fleet` |
| Работает | `$(sync~spin) Fleet: 2/5 ✅` |
| Завершена | `$(check) Fleet: 5/5 ✅` |
| Ошибка | `$(error) Fleet: 3/5 ⚠️` |

Клик → открывает Sidebar Dashboard.

---

## 🔐 Аутентификация

Расширение использует **VS Code Authentication API** — отдельный токен не нужен.

При первом запуске VS Code попросит авторизоваться через GitHub с правами `repo`.

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

- [ ] Auto-merge PR после ревью ботом
- [ ] Webhook вместо polling для мониторинга PR
- [ ] Графический DAG визуализатор зависимостей
- [ ] Шаблоны задач (test-suite, refactor, docs, i18n)
- [ ] Slash commands в чате для шаблонов
- [ ] Интеграция с GitHub Projects (Kanban доска)
- [ ] Нотификации при завершении через VS Code notifications
- [ ] Экспорт отчёта сессии (Markdown/JSON)
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
