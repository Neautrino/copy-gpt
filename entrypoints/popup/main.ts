import './style.css';
import { browser } from 'wxt/browser';
import { OPTION_LABELS, type ExportOptions } from '@/lib/options';
import { getSettings, setSetting, watchSettings } from '@/lib/settings';

const list = document.querySelector<HTMLDivElement>('#options')!;
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
const render = (options: ExportOptions) => {
  for (const input of inputs) {
    const key = keys.find((candidate) => candidate === input.dataset.option);
    if (key) input.checked = options[key];
  }
};

for (const input of inputs) {
  input.addEventListener('change', () => {
    const key = keys.find((candidate) => candidate === input.dataset.option);
    if (key) void setSetting(key, input.checked);
  });
}

render(await getSettings());
watchSettings(render);

if (/Mac|iPhone|iPad/.test(navigator.platform)) document.querySelector('#shortcut')!.textContent = '⌥⇧C';
document.querySelector('#version')!.textContent = `v${browser.runtime.getManifest().version}`;
