# TODO — Copilot Fleet

Дорожная карта и план доработок.

---

## 🔴 Критично (MVP polish)

- [ ] **Тесты** — написать unit-тесты для core/ (engine, state, pipeline, monitor, decomposer)
- [ ] **Error handling в dispatcher** — если Issue не создался (rate limit, 403), retry или graceful fallback
- [ ] **Валидация repo** — при ручном вводе `owner/repo` проверять существование и доступ до запуска
- [ ] **Cancel отдельной подзадачи** — сейчас abort останавливает всю сессию; нужен cancel одного узла
- [ ] **Persist sessions** — сохранять сессии в globalState, чтобы не терять при перезапуске VS Code

---

## 🟡 Важно (v1.1)

- [ ] **Webhook вместо polling** — GitHub Webhook / GitHub App для мгновенного обнаружения PR (вместо 30-сек polling)
- [ ] **Auto-merge** — настройка `autoMergePRs` работает, но нужен review-gate (ждать CI green + approval)
- [ ] **Conflict resolution** — если два агента меняют одни файлы, обнаруживать конфликты и предлагать решение
- [ ] **Task templates** — preset-шаблоны задач (test-suite, refactor, i18n, migrate, security-audit)
- [ ] **Drag-to-connect dependencies** — в Workflow Editor тянуть рёбра мышкой между узлами (сейчас — dropdown)
- [ ] **Undo/Redo** — в Workflow Editor для отмены действий в графе
- [ ] **Keyboard shortcuts** — Delete для удаления узла, Ctrl+Z undo, etc.
- [ ] **Progress details** — показывать что именно агент делает (commits, файлы, diff preview)

---

## 🟢 Улучшения (v1.2+)

- [ ] **VS Code Marketplace** — опубликовать расширение в Marketplace
- [ ] **CI/CD** — GitHub Actions для build + test + package + publish
- [ ] **GitHub Projects** — создавать Project Board из сессии для Kanban-управления
- [ ] **Notifications** — VS Code notification при завершении задачи (+ звуковой сигнал по настройке)
- [ ] **Report export** — экспорт результата сессии в Markdown/JSON (задачи, PR, время, статусы)
- [ ] **Multi-repo** — одна сессия может работать с несколькими репозиториями
- [ ] **Agent marketplace** — импорт/экспорт кастомных агентов (JSON-файлы)
- [ ] **Diff preview** — в Detail Panel показывать diff от PR прямо в Workflow Editor
- [ ] **Cost estimator** — оценка стоимости сессии в premium requests до запуска
- [ ] **Session compare** — сравнение двух сессий (время, качество, покрытие)

---

## 🔵 Исследование

- [ ] **GitHub App** — вместо personal token использовать GitHub App для лучших лимитов
- [ ] **Multi-model decomposer** — поддержка Claude, Gemini для декомпозиции (сейчас только VS Code LM API)
- [ ] **Agent specialization AI** — ML-модель для автоматического выбора агента по типу задачи
- [ ] **Collaborative mode** — несколько разработчиков работают с одной сессией
- [ ] **Telemetry dashboard** — встроенная аналитика использования (время, успешность, паттерны)

---

## ✅ Выполнено

- [x] Chat Participant @fleet с 10 командами
- [x] Визуальный Workflow Editor (ComfyUI-стиль)
- [x] 7 встроенных агентов + реестр кастомных
- [x] DAG-зависимости с pipeline
- [x] Inline editing задач в графе
- [x] Manual mode (создание сессий, CRUD задач)
- [x] Progress bar с процентами
- [x] Force-complete и Reset застрявших сессий
- [x] Merge/Amend из чата и графа
- [x] Sync to Workspace (git pull)
- [x] SVG-иконки (30+, без emoji)
- [x] Sidebar Dashboard + Status Bar
- [x] Retry с экспоненциальным backoff
- [x] Resilient network error handling
