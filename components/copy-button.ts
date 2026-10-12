import { OPTION_LABELS, type ExportOptions } from '@/lib/options';
import { ICONS } from './icons';

export type Theme = 'light' | 'dark';
export type DownloadFormat = 'markdown' | 'json';

export interface CopyButtonHandlers {
  /** Called synchronously inside the click handler so the clipboard write keeps the user gesture. */
  onCopy(): void;
  onDownload(format: DownloadFormat): void;
  onToggle(key: keyof ExportOptions, value: boolean): void;
}

export interface CopyButton {
  setOptions(options: ExportOptions): void;
  setTheme(theme: Theme): void;
  busy(label: string): void;
  success(label: string): void;
  warn(label: string, message: string): void;
  fail(label: string, message: string): void;
  /** Removes listeners on `document` and pending timers. */
  destroy(): void;
}

const IDLE_LABEL = 'Copy chat';
const SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌥⇧C' : 'Alt+Shift+C';

export function createCopyButton(container: HTMLElement, handlers: CopyButtonHandlers): CopyButton {
  const optionKeys = Object.keys(OPTION_LABELS) as (keyof ExportOptions)[];
  container.innerHTML = `
    <div class="cc" data-state="idle" data-theme="light">
      <div class="bar" role="group" aria-label="Copy Chat">
        <button class="main" type="button" title="Copy the whole chat as Markdown (${SHORTCUT})">
          <span class="icon">${ICONS.copy}${ICONS.spinner}${ICONS.check}${ICONS.alert}</span>
          <span class="label">${IDLE_LABEL}</span>
        </button>
        <span class="divider" aria-hidden="true"></span>
        <button class="more" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="More export options">
          ${ICONS.chevron}
        </button>
      </div>
      <div class="menu" role="menu" aria-label="Export options">
        <button class="item" type="button" role="menuitem" data-action="copy">
          ${ICONS.copy}<span class="text">Copy as Markdown</span><kbd>${SHORTCUT}</kbd>
        </button>
        <button class="item" type="button" role="menuitem" data-action="markdown">
          ${ICONS.download}<span class="text">Download Markdown</span><span class="meta">.md</span>
        </button>
        <button class="item" type="button" role="menuitem" data-action="json">
          ${ICONS.braces}<span class="text">Download JSON</span><span class="meta">.json</span>
        </button>
        <div class="separator" role="separator"></div>
        <div class="section" aria-hidden="true">Include</div>
        ${optionKeys
          .map(
            (key) => `
        <button class="item toggle" type="button" role="menuitemcheckbox" aria-checked="false" data-option="${key}">
          <span class="text">${OPTION_LABELS[key].label}<span class="hint">${OPTION_LABELS[key].hint}</span></span>
          <span class="switch" aria-hidden="true"></span>
        </button>`,
          )
          .join('')}
      </div>
      <div class="toast" role="status" aria-live="polite">
        <span class="toast-text"></span>
      </div>
    </div>`;

  const root = container.querySelector<HTMLElement>('.cc')!;
  const main = root.querySelector<HTMLButtonElement>('.main')!;
  const more = root.querySelector<HTMLButtonElement>('.more')!;
  const label = root.querySelector<HTMLElement>('.label')!;
  const menu = root.querySelector<HTMLElement>('.menu')!;
  const toast = root.querySelector<HTMLElement>('.toast')!;
  const toastText = root.querySelector<HTMLElement>('.toast-text')!;
  const items = [...menu.querySelectorAll<HTMLButtonElement>('.item')];
  let resetTimer: number | undefined;
  let toastTimer: number | undefined;
  const optionOf = (item: HTMLElement) => optionKeys.find((key) => key === item.dataset.option);

  const setState = (state: 'idle' | 'busy' | 'success' | 'warning' | 'error', text: string, resetAfter?: number) => {
    clearTimeout(resetTimer);
    root.dataset.state = state;
    label.textContent = text;
    main.setAttribute('aria-busy', String(state === 'busy'));
    if (resetAfter) resetTimer = window.setTimeout(() => setState('idle', IDLE_LABEL), resetAfter);
  };

  const showToast = (message: string, kind: 'warning' | 'error') => {
    clearTimeout(toastTimer);
    toastText.textContent = message;
    root.dataset.toast = kind;
    toastTimer = window.setTimeout(() => delete root.dataset.toast, 8000);
  };

  const setMenuOpen = (open: boolean, focus: 'first' | 'trigger' | 'none' = 'none') => {
    if (open) {
      root.dataset.open = '';
      delete root.dataset.toast;
    } else {
      delete root.dataset.open;
    }
    more.setAttribute('aria-expanded', String(open));
    if (focus === 'first') items[0]?.focus();
    if (focus === 'trigger') more.focus();
  };

  main.addEventListener('click', () => {
    setMenuOpen(false);
    handlers.onCopy();
  });

  more.addEventListener('click', () => setMenuOpen(!('open' in root.dataset)));
  more.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setMenuOpen(true, 'first');
    }
  });

  menu.addEventListener('click', (event) => {
    const item = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.item') : null;
    if (!item) return;
    const option = optionOf(item);
    if (option) {
      // Toggles keep the menu open so several can be changed at once.
      handlers.onToggle(option, item.getAttribute('aria-checked') !== 'true');
      return;
    }
    setMenuOpen(false);
    if (item.dataset.action === 'copy') handlers.onCopy();
    else handlers.onDownload(item.dataset.action === 'json' ? 'json' : 'markdown');
  });

  menu.addEventListener('keydown', (event) => {
    const index = items.findIndex((item) => item === event.target);
    const focusAt = (next: number) => items[(next + items.length) % items.length]?.focus();
    if (event.key === 'ArrowDown') focusAt(index + 1);
    else if (event.key === 'ArrowUp') focusAt(index - 1);
    else if (event.key === 'Home') focusAt(0);
    else if (event.key === 'End') focusAt(items.length - 1);
    else if (event.key === 'Escape') setMenuOpen(false, 'trigger');
    else if (event.key === 'Tab') setMenuOpen(false);
    else return;
    event.preventDefault();
  });

  // Close when clicking anywhere outside the widget (events from inside the shadow root include `root`).
  const documentListeners = new AbortController();
  document.addEventListener(
    'pointerdown',
    (event) => {
      if ('open' in root.dataset && !event.composedPath().includes(root)) setMenuOpen(false);
    },
    { signal: documentListeners.signal },
  );

  toast.addEventListener('click', () => delete root.dataset.toast);

  return {
    setOptions(options) {
      for (const item of items) {
        const option = optionOf(item);
        if (option) item.setAttribute('aria-checked', String(options[option]));
      }
    },
    setTheme(theme) {
      root.dataset.theme = theme;
    },
    busy(text) {
      delete root.dataset.toast;
      setState('busy', text);
    },
    success(text) {
      setState('success', text, 2200);
    },
    warn(text, message) {
      setState('warning', text, 4000);
      showToast(message, 'warning');
    },
    fail(text, message) {
      setState('error', text, 3000);
      showToast(message, 'error');
    },
    destroy() {
      documentListeners.abort();
      clearTimeout(resetTimer);
      clearTimeout(toastTimer);
    },
  };
}
