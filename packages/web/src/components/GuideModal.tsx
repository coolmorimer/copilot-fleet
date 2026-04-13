import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { BookOpen, ChevronRight, X } from 'lucide-react';

import { useT } from '../i18n/useT.js';
import { cx } from '../panels/shared.js';

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

/* ── Section data ─────────────────────────────────────── */

interface Section {
  id: string;
  titleEn: string;
  titleRu: string;
  content: () => ReactElement;
}

function H3({ children }: { children: ReactNode }): ReactElement {
  return <h3 className="mb-2 mt-4 text-base font-semibold text-fleet-text">{children}</h3>;
}
function P({ children }: { children: ReactNode }): ReactElement {
  return <p className="mb-3 text-sm leading-6 text-fleet-muted">{children}</p>;
}
function Ul({ children }: { children: ReactNode }): ReactElement {
  return <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-fleet-muted">{children}</ul>;
}
function Kbd({ children }: { children: ReactNode }): ReactElement {
  return <kbd className="rounded border border-fleet-border bg-fleet-surface px-1.5 py-0.5 font-mono text-xs text-fleet-text">{children}</kbd>;
}
function T({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="mb-3 overflow-x-auto rounded-xl border border-fleet-border">
      <table className="w-full text-left text-sm">
        {children}
      </table>
    </div>
  );
}
function Th({ children }: { children: ReactNode }): ReactElement {
  return <th className="border-b border-fleet-border bg-fleet-surface/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-fleet-muted">{children}</th>;
}
function Td({ children }: { children: ReactNode }): ReactElement {
  return <td className="border-b border-fleet-border px-3 py-2 text-fleet-text">{children}</td>;
}

/* ── Russian content sections ─────────────────────────── */

const SECTIONS: Section[] = [
  {
    id: 'overview',
    titleEn: 'Interface Overview',
    titleRu: 'Обзор интерфейса',
    content: () => (
      <>
        <P>CopilotFleet — визуальная платформа оркестрации AI-агентов. Вы строите графы из нод, соединяете их связями и запускаете выполнение.</P>
        <pre className="mb-3 overflow-x-auto rounded-xl border border-fleet-border bg-fleet-surface/50 p-3 font-mono text-xs text-fleet-muted">
{`┌─────────────────────────────────────────┐
│              ТУЛБАР                     │
├──────────┬─────────────────┬────────────┤
│ БОКОВАЯ  │     КАНВАС      │ ИНСПЕКТОР  │
│ ПАНЕЛЬ   │                 │            │
├──────────┴─────────────────┴────────────┤
│              КОНСОЛЬ                    │
├─────────────────────────────────────────┤
│              СТАТУС-БАР                 │
└─────────────────────────────────────────┘`}
        </pre>
        <Ul>
          <li><strong>Тулбар</strong> — Запуск, Стоп, Сохранить, Загрузить, Шаблоны, Настройки</li>
          <li><strong>Боковая панель</strong> — палитра нод и агентов, поиск, секции</li>
          <li><strong>Канвас</strong> — основная рабочая область с нодами и связями</li>
          <li><strong>Инспектор</strong> — свойства выбранной ноды (правая панель)</li>
          <li><strong>Консоль</strong> — лог выполнения сессии</li>
          <li><strong>Статус-бар</strong> — информация о состоянии внизу</li>
        </Ul>
      </>
    ),
  },
  {
    id: 'sidebar',
    titleEn: 'Sidebar — Node Palette',
    titleRu: 'Боковая панель — палитра нод',
    content: () => (
      <>
        <P>Левая панель содержит все доступные ноды, сгруппированные по секциям.</P>
        <T>
          <thead><tr><Th>Секция</Th><Th>Описание</Th></tr></thead>
          <tbody>
            <tr><Td>Триггеры</Td><Td>Ноды, запускающие граф</Td></tr>
            <tr><Td>Агенты</Td><Td>Встроенные AI-агенты (Кодер, Ревьюер, Тестировщик…)</Td></tr>
            <tr><Td>Мои агенты</Td><Td>Пользовательские агенты</Td></tr>
            <tr><Td>Модели</Td><Td>Прямой вызов LLM</Td></tr>
            <tr><Td>Логика</Td><Td>Условие, Разветвитель, Слияние, Группа</Td></tr>
            <tr><Td>Инструменты</Td><Td>Внешние инструменты и Human-in-the-loop</Td></tr>
            <tr><Td>Вывод</Td><Td>Нода результата</Td></tr>
          </tbody>
        </T>
        <H3>Добавление нод</H3>
        <Ul>
          <li><strong>Клик</strong> — нажмите на элемент в палитре</li>
          <li><strong>Drag &amp; Drop</strong> — перетащите элемент на канвас</li>
        </Ul>
      </>
    ),
  },
  {
    id: 'canvas',
    titleEn: 'Working with Canvas',
    titleRu: 'Работа с канвасом',
    content: () => (
      <>
        <P>Канвас — основная рабочая область для построения графов.</P>
        <T>
          <thead><tr><Th>Действие</Th><Th>Управление</Th></tr></thead>
          <tbody>
            <tr><Td>Перемещение</Td><Td>Зажмите ЛКМ на пустой области</Td></tr>
            <tr><Td>Масштаб</Td><Td>Колёсико мыши / Ctrl+колёсико</Td></tr>
            <tr><Td>Выделение</Td><Td>Клик по ноде</Td></tr>
            <tr><Td>Множественное выделение</Td><Td>Shift + клик</Td></tr>
            <tr><Td>Удаление</Td><Td><Kbd>Delete</Kbd> / <Kbd>Backspace</Kbd></Td></tr>
          </tbody>
        </T>
        <H3>Соединение нод</H3>
        <P>Зажмите ЛКМ на порту-источнике (правый край ноды) и перетащите к порту-приёмнику (левый край). Анимированные связи показывают активную передачу данных.</P>
        <H3>Мини-карта и сетка</H3>
        <Ul>
          <li>Мини-карта — быстрая навигация по большим графам (включается в Настройках)</li>
          <li>Привязка к сетке — ноды автоматически выравниваются (8–64 px)</li>
        </Ul>
      </>
    ),
  },
  {
    id: 'nodes',
    titleEn: 'Node Types',
    titleRu: 'Типы нод',
    content: () => (
      <>
        <T>
          <thead><tr><Th>Тип</Th><Th>Назначение</Th><Th>Порты</Th></tr></thead>
          <tbody>
            <tr><Td>Триггер</Td><Td>Стартовая нода — запускает граф</Td><Td>1 выход</Td></tr>
            <tr><Td>Агент</Td><Td>AI-агент с LLM-провайдером</Td><Td>вход + выход</Td></tr>
            <tr><Td>LLM</Td><Td>Прямой вызов модели</Td><Td>вход + выход</Td></tr>
            <tr><Td>Условие</Td><Td>Ветвление True / False</Td><Td>вход, 2 выхода</Td></tr>
            <tr><Td>Разветвитель</Td><Td>Параллельные пути (2–5)</Td><Td>вход, N выходов</Td></tr>
            <tr><Td>Слияние</Td><Td>Объединение потоков (all/any/race)</Td><Td>2 входа, 1 выход</Td></tr>
            <tr><Td>Human-in-the-loop</Td><Td>Ручное одобрение</Td><Td>вход + выход</Td></tr>
            <tr><Td>Инструмент</Td><Td>Вызов внешнего инструмента</Td><Td>вход + выход</Td></tr>
            <tr><Td>Вывод</Td><Td>Конечная нода результата</Td><Td>1 вход</Td></tr>
            <tr><Td>Группа</Td><Td>Визуальный контейнер</Td><Td>—</Td></tr>
          </tbody>
        </T>
      </>
    ),
  },
  {
    id: 'agents',
    titleEn: 'Built-in Agents',
    titleRu: 'Встроенные агенты',
    content: () => (
      <>
        <P>CopilotFleet предлагает 10 предварительно настроенных агентов:</P>
        <T>
          <thead><tr><Th>Агент</Th><Th>Модель</Th><Th>Назначение</Th></tr></thead>
          <tbody>
            <tr><Td>Кодер</Td><Td>claude-sonnet-4</Td><Td>Реализация кода по плану</Td></tr>
            <tr><Td>Ревьюер</Td><Td>claude-sonnet-4</Td><Td>Ревью диффов, поиск ошибок</Td></tr>
            <tr><Td>Тестировщик</Td><Td>o3</Td><Td>Unit/integration тесты, TDD</Td></tr>
            <tr><Td>Рефакторер</Td><Td>gpt-4.1</Td><Td>Упрощение без изменения поведения</Td></tr>
            <tr><Td>Документатор</Td><Td>gpt-4.1-mini</Td><Td>API-доки, README, ADR</Td></tr>
            <tr><Td>Безопасность</Td><Td>o3</Td><Td>OWASP-аудит, CVE-проверки</Td></tr>
            <tr><Td>Дизайнер</Td><Td>gpt-4.1</Td><Td>UX/UI, WCAG, адаптивный дизайн</Td></tr>
            <tr><Td>DevOps</Td><Td>claude-sonnet-4</Td><Td>CI/CD, контейнеры, IaC</Td></tr>
            <tr><Td>Исследователь</Td><Td>o4-mini</Td><Td>Анализ кодовой базы</Td></tr>
            <tr><Td>Планировщик</Td><Td>claude-sonnet-4</Td><Td>Декомпозиция задач</Td></tr>
          </tbody>
        </T>
        <P>Системный промпт каждого агента можно посмотреть и отредактировать в Инспекторе ноды.</P>
      </>
    ),
  },
  {
    id: 'custom-agent',
    titleEn: 'Custom Agents',
    titleRu: 'Создание агента',
    content: () => (
      <>
        <P>Откройте секцию «Мои агенты» → Редактор агента через Инспектор.</P>
        <T>
          <thead><tr><Th>Поле</Th><Th>Описание</Th></tr></thead>
          <tbody>
            <tr><Td>Имя</Td><Td>Уникальный идентификатор</Td></tr>
            <tr><Td>Отображаемое имя</Td><Td>Человекочитаемое название</Td></tr>
            <tr><Td>Провайдер / Модель</Td><Td>Выбор LLM</Td></tr>
            <tr><Td>Системный промпт</Td><Td>Детальная инструкция для агента</Td></tr>
            <tr><Td>Температура</Td><Td>0 = точный, 1 = креативный</Td></tr>
            <tr><Td>Макс. токенов</Td><Td>Лимит длины ответа</Td></tr>
            <tr><Td>Include/Exclude</Td><Td>Паттерны файлов</Td></tr>
            <tr><Td>Before/After команда</Td><Td>Скрипты до и после работы</Td></tr>
          </tbody>
        </T>
      </>
    ),
  },
  {
    id: 'templates',
    titleEn: 'Graph Templates',
    titleRu: 'Шаблоны графов',
    content: () => (
      <>
        <P>Шаблоны — готовые конфигурации для типичных сценариев. Нажмите «Шаблоны» в тулбаре.</P>
        <T>
          <thead><tr><Th>Шаблон</Th><Th>Агентов</Th><Th>Описание</Th></tr></thead>
          <tbody>
            <tr><Td>Quick Fix</Td><Td>1</Td><Td>Один агент для быстрого патча</Td></tr>
            <tr><Td>Feature Squad</Td><Td>3</Td><Td>План → код → ревью</Td></tr>
            <tr><Td>Fullstack Team</Td><Td>6</Td><Td>Полная команда разработки</Td></tr>
            <tr><Td>Refactor Platoon</Td><Td>5</Td><Td>Рефакторинг с валидацией</Td></tr>
            <tr><Td>Security Audit</Td><Td>3</Td><Td>Аудит с ревью</Td></tr>
          </tbody>
        </T>
      </>
    ),
  },
  {
    id: 'settings',
    titleEn: 'Settings',
    titleRu: 'Настройки',
    content: () => (
      <>
        <H3>Вкладка «Общие»</H3>
        <T>
          <thead><tr><Th>Параметр</Th><Th>Описание</Th></tr></thead>
          <tbody>
            <tr><Td>Язык</Td><Td>EN / RU</Td></tr>
            <tr><Td>Тема</Td><Td>Dark / Light</Td></tr>
            <tr><Td>Пресет</Td><Td>Solo / Squad / Platoon / Fleet</Td></tr>
            <tr><Td>Привязка к сетке</Td><Td>Ноды прилипают к сетке</Td></tr>
            <tr><Td>Размер сетки</Td><Td>8–64 px</Td></tr>
            <tr><Td>Мини-карта</Td><Td>Навигация по большим графам</Td></tr>
            <tr><Td>Автосохранение</Td><Td>Автоматическое сохранение</Td></tr>
          </tbody>
        </T>
        <H3>Вкладка «Провайдеры»</H3>
        <P>Управление подключениями к LLM-провайдерам: добавление, настройка API-ключей, тестирование.</P>
      </>
    ),
  },
  {
    id: 'providers',
    titleEn: 'Providers & API Keys',
    titleRu: 'Провайдеры и API-ключи',
    content: () => (
      <>
        <T>
          <thead><tr><Th>Провайдер</Th><Th>Модели</Th><Th>API-ключ?</Th></tr></thead>
          <tbody>
            <tr><Td>GitHub Copilot</Td><Td>claude-sonnet-4, gpt-4o, o3-mini</Td><Td>Да (GitHub Auth)</Td></tr>
            <tr><Td>OpenAI</Td><Td>gpt-4o, gpt-4.1, o3-mini</Td><Td>Да</Td></tr>
            <tr><Td>Anthropic</Td><Td>claude-sonnet-4, claude-3-7-sonnet</Td><Td>Да</Td></tr>
            <tr><Td>Ollama</Td><Td>llama3.2, qwen2.5-coder</Td><Td>Нет (локальный)</Td></tr>
            <tr><Td>LM Studio</Td><Td>local-model</Td><Td>Нет (локальный)</Td></tr>
            <tr><Td>Custom API</Td><Td>custom-model</Td><Td>Да</Td></tr>
            <tr><Td>VS Code Local</Td><Td>copilot-local</Td><Td>Нет</Td></tr>
          </tbody>
        </T>
        <H3>Добавление провайдера</H3>
        <Ul>
          <li>Откройте Настройки → Провайдеры</li>
          <li>Выберите тип из выпадающего меню</li>
          <li>Нажмите «Добавить провайдера»</li>
          <li>Настройте API-ключ и Base URL</li>
          <li>Нажмите «Тест» для проверки</li>
        </Ul>
        <P>API-ключи хранятся в localStorage и маскируются после сохранения.</P>
      </>
    ),
  },
  {
    id: 'inspector',
    titleEn: 'Node Inspector',
    titleRu: 'Инспектор ноды',
    content: () => (
      <>
        <P>Правая панель отображается при выделении ноды на канвасе (≥1280px).</P>
        <T>
          <thead><tr><Th>Поле</Th><Th>Описание</Th></tr></thead>
          <tbody>
            <tr><Td>Метка</Td><Td>Имя ноды на карточке</Td></tr>
            <tr><Td>Описание</Td><Td>Текстовое описание роли</Td></tr>
            <tr><Td>Статус</Td><Td>idle / running / done / error…</Td></tr>
            <tr><Td>Прогресс</Td><Td>Процент выполнения (0–100%)</Td></tr>
          </tbody>
        </T>
        <P>Для агентов также доступны: провайдер, модель, промпт, температура, паттерны файлов.</P>
      </>
    ),
  },
  {
    id: 'console',
    titleEn: 'Console',
    titleRu: 'Консоль',
    content: () => (
      <>
        <P>Нижняя панель — лог выполнения сессии.</P>
        <Ul>
          <li><strong>Фильтрация:</strong> All / Info / Success / Error</li>
          <li><strong>Очистка:</strong> кнопка удаляет все записи</li>
          <li><strong>Размер:</strong> перетащите верхнюю границу</li>
        </Ul>
      </>
    ),
  },
  {
    id: 'execution',
    titleEn: 'Run & Stop',
    titleRu: 'Запуск и остановка',
    content: () => (
      <>
        <H3>Запуск</H3>
        <P>Постройте граф, нажмите «Запуск». Триггеры запускаются первыми, затем — зависимые ноды.</P>
        <H3>Остановка</H3>
        <P>Нажмите «Стоп» — все выполняющиеся и ожидающие ноды переходят в статус «cancelled».</P>
        <T>
          <thead><tr><Th>Статус</Th><Th>Значение</Th></tr></thead>
          <tbody>
            <tr><Td>idle</Td><Td>Ожидание запуска</Td></tr>
            <tr><Td>queued</Td><Td>В очереди</Td></tr>
            <tr><Td>running</Td><Td>Выполняется</Td></tr>
            <tr><Td>done</Td><Td>Успешно завершено</Td></tr>
            <tr><Td>error</Td><Td>Ошибка</Td></tr>
            <tr><Td>skipped</Td><Td>Пропущено по условию</Td></tr>
            <tr><Td>cancelled</Td><Td>Отменено</Td></tr>
          </tbody>
        </T>
      </>
    ),
  },
  {
    id: 'save-load',
    titleEn: 'Save & Load',
    titleRu: 'Сохранение и загрузка',
    content: () => (
      <>
        <Ul>
          <li><strong>Сохранить</strong> — граф сериализуется в JSON и сохраняется в localStorage</li>
          <li><strong>Загрузить</strong> — загружает последний сохранённый граф</li>
          <li><strong>Автосохранение</strong> — включите в Настройки → Общие</li>
          <li><strong>Недавние сессии</strong> — история в боковой панели</li>
        </Ul>
      </>
    ),
  },
  {
    id: 'hotkeys',
    titleEn: 'Hotkeys & Tips',
    titleRu: 'Горячие клавиши и советы',
    content: () => (
      <>
        <T>
          <thead><tr><Th>Действие</Th><Th>Клавиша</Th></tr></thead>
          <tbody>
            <tr><Td>Удалить ноду</Td><Td><Kbd>Delete</Kbd> / <Kbd>Backspace</Kbd></Td></tr>
            <tr><Td>Выделить все</Td><Td><Kbd>Ctrl+A</Kbd></Td></tr>
            <tr><Td>Отменить</Td><Td><Kbd>Ctrl+Z</Kbd></Td></tr>
            <tr><Td>Масштаб +</Td><Td><Kbd>Ctrl+=</Kbd></Td></tr>
            <tr><Td>Масштаб −</Td><Td><Kbd>Ctrl+−</Kbd></Td></tr>
          </tbody>
        </T>
        <H3>Советы</H3>
        <Ul>
          <li>Начните с шаблона — не стройте с нуля</li>
          <li>Именуйте ноды — дайте понятные имена в Инспекторе</li>
          <li>Используйте группы для читаемости</li>
          <li>Проверяйте системные промпты агентов</li>
          <li>Тестируйте провайдеров перед запуском</li>
        </Ul>
      </>
    ),
  },
  {
    id: 'troubleshooting',
    titleEn: 'Troubleshooting',
    titleRu: 'Устранение неполадок',
    content: () => (
      <>
        <H3>Провайдер не подключается</H3>
        <Ul>
          <li>Проверьте API-ключ</li>
          <li>Для Ollama / LM Studio — убедитесь, что сервер запущен</li>
          <li>Нажмите «Тест» и прочитайте ошибку</li>
        </Ul>
        <H3>Ноды не соединяются</H3>
        <Ul>
          <li>Тяните от правого порта к левому</li>
          <li>Нельзя создать петлю</li>
        </Ul>
        <H3>Граф не сохраняется</H3>
        <Ul>
          <li>Проверьте, что localStorage не заполнен</li>
          <li>Включите Автосохранение</li>
        </Ul>
        <H3>Интерфейс на английском</H3>
        <P>Настройки → Общие → Язык → RU, или кнопка EN/RU в статус-баре.</P>
      </>
    ),
  },
];

/* ── Component ────────────────────────────────────────── */

export function GuideModal({ open, onClose }: GuideModalProps): ReactElement | null {
  const t = useT();
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const isRu = t('guide.title') === 'Руководство пользователя';

  const activeSection = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] flex max-h-[90vh] w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] border border-fleet-border bg-fleet-deep shadow-2xl outline-none">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-fleet-border px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fleet-accent/20">
                <BookOpen className="h-5 w-5 text-fleet-accent" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-semibold text-fleet-text">{t('guide.title')}</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-sm text-fleet-muted">{t('guide.subtitle')}</Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="rounded-lg border border-fleet-border bg-fleet-surface p-2 text-fleet-muted transition hover:border-fleet-accent hover:text-white" aria-label={t('guide.closeAria')}>
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Body: sidebar + content */}
          <div className="flex min-h-0 flex-1">
            {/* TOC sidebar */}
            <nav className="w-56 shrink-0 overflow-y-auto border-r border-fleet-border bg-fleet-surface/30 p-2">
              <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-widest text-fleet-muted">{t('guide.toc')}</div>
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveId(section.id)}
                  className={cx(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition',
                    activeId === section.id
                      ? 'bg-fleet-accent/10 font-medium text-fleet-accent'
                      : 'text-fleet-muted hover:bg-fleet-surface/60 hover:text-fleet-text',
                  )}
                >
                  <ChevronRight className={cx('h-3 w-3 shrink-0 transition', activeId === section.id ? 'text-fleet-accent' : 'text-fleet-border')} />
                  <span className="truncate">{isRu ? section.titleRu : section.titleEn}</span>
                </button>
              ))}
            </nav>

            {/* Content area */}
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <h2 className="mb-4 text-xl font-bold text-fleet-text">{isRu ? activeSection.titleRu : activeSection.titleEn}</h2>
              {activeSection.content()}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
