import './style.css';
import { browser } from 'wxt/browser';
import { ICONS } from './icons';
import { copyToClipboard } from '@/lib/clipboard';
import {
  connectTab,
  requestRender,
  requestRun,
  SUPPORTED_SITES_HINT,
  type ExportAction,
  type ExportOutcome,
  type ExportSuccess,
} from '@/lib/messages';
import { OPTION_LABELS, type ExportOptions } from '@/lib/options';
import { getSettings, setSetting, watchSettings } from '@/lib/settings';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const status = $('#status');
const result = $('#result');
const copyButton = $<HTMLButtonElement>('#copy');
const copyLabel = $('.primary-label');
const actionButtons = [copyButton, $<HTMLButtonElement>('#markdown'), $<HTMLButtonElement>('#json')];

const iconNames = Object.keys(ICONS) as (keyof typeof ICONS)[];
for (const slot of document.querySelectorAll<HTMLElement>('[data-icon]')) {
  const names = (slot.dataset.icon ?? '').split(' ');
  slot.innerHTML = iconNames.filter((name) => names.includes(name)).map((name) => ICONS[name]).join('');
}

// ---------- Export actions ----------

const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
const tabId = tab?.id;
let busy = false;

function showResult(kind: 'success' | 'warning' | 'error', message: string) {
  result.dataset.kind = kind;
  result.textContent = message;
}

function report(verb: string, outcome: ExportOutcome) {
  if (!outcome.ok) return showResult('error', outcome.error);
  const done = `${verb} ${outcome.messageCount} message${outcome.messageCount === 1 ? '' : 's'}.`;
  if (outcome.warnings.length > 0) showResult('warning', `${done} ${outcome.warnings.join(' ')}`);
  else showResult('success', done);
}

function setBusy(button: HTMLButtonElement | null) {
  busy = button !== null;
  for (const action of actionButtons) action.disabled = busy;
  copyButton.setAttribute('aria-busy', String(button === copyButton));
  copyLabel.textContent = button === copyButton ? 'Copying…' : 'Copy chat';
  if (busy) delete result.dataset.kind;
}

// The clipboard write starts inside the click (with the Markdown as a promise) so the popup keeps the
// user's gesture while the chat tab builds the export.
copyButton.addEventListener('click', () => {
  if (busy || tabId === undefined) return;
  setBusy(copyButton);
  const rendered = requestRender(tabId).then((outcome) => {
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome;
  });
  copyToClipboard(rendered.then(({ markdown, html }) => ({ text: markdown, html })))
    .then(() => rendered)
    .then((outcome: ExportSuccess) => {
      report('Copied', outcome);
      copyButton.dataset.done = '';
      setTimeout(() => delete copyButton.dataset.done, 1600);
    })
    .catch((error: unknown) => showResult('error', error instanceof Error ? error.message : String(error)))
    .finally(() => setBusy(null));
});

for (const action of ['markdown', 'json'] satisfies ExportAction[]) {
  const button = $<HTMLButtonElement>(`#${action}`);
  button.addEventListener('click', async () => {
    if (busy || tabId === undefined) return;
    setBusy(button);
    const outcome = await requestRun(tabId, action).catch(
      (): ExportOutcome => ({ ok: false, error: 'The chat tab stopped responding. Reload it and try again.' }),
    );
    report('Saved', outcome);
    setBusy(null);
  });
}

if (tabId === undefined) {
  status.textContent = SUPPORTED_SITES_HINT;
} else {
  const page = await connectTab(tabId, tab?.url).catch(() => null);
  if (!page) status.textContent = SUPPORTED_SITES_HINT;
  else if (!page.onChat) status.textContent = `Open a chat on ${page.siteName} to copy it.`;
  else {
    status.textContent = `${page.siteName} chat ready to copy`;
    status.dataset.ready = '';
    for (const action of actionButtons) action.disabled = false;
  }
}

const commands = await browser.commands.getAll();
const shortcut = commands.find((command) => command.name === 'copy-chat')?.shortcut;
if (shortcut) {
  const kbd = $('#shortcut');
  kbd.textContent = shortcut;
  kbd.hidden = false;
}

// ---------- Settings ----------

const list = $('#options');
const keys = Object.keys(OPTION_LABELS) as (keyof ExportOptions)[];
list.innerHTML = keys
  .map(
    (key) => `
  <label class="option">
    <span class="option-text">
      <span class="option-label">${OPTION_LABELS[key].label}</span>
      <span class="option-hint">${OPTION_LABELS[key].hint}</span>
    </span>
    <input type="checkbox" role="switch" data-option="${key}" />
  </label>`,
  )
  .join('');

const inputs = [...list.querySelectorAll<HTMLInputElement>('input[data-option]')];
const optionOf = (input: HTMLInputElement) => keys.find((key) => key === input.dataset.option);
const render = (options: ExportOptions) => {
  for (const input of inputs) {
    const key = optionOf(input);
    if (key) input.checked = options[key];
  }
};
for (const input of inputs) {
  input.addEventListener('change', () => {
    const key = optionOf(input);
    if (key) void setSetting(key, input.checked);
  });
}
render(await getSettings());
watchSettings(render);

$('#version').textContent = `v${browser.runtime.getManifest().version}`;
