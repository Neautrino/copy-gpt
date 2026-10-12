import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  connectTab,
  EXPORT_ACTIONS,
  requestRun,
  SUPPORTED_SITES_HINT,
  type ExportAction,
  type ExportOutcome,
} from '@/lib/messages';

const MENU_TITLES: Record<ExportAction, string> = {
  copy: 'Copy chat as Markdown',
  markdown: 'Download chat as Markdown',
  json: 'Download chat as JSON',
};

/** The right-click items only appear on chat pages. */
const CHAT_PAGES = ['https://chatgpt.com', 'https://chat.openai.com'].flatMap((origin) => [
  `${origin}/c/*`,
  `${origin}/g/*`,
  `${origin}/uc/*`,
  `${origin}/share/*`,
]).concat(['https://claude.ai/chat/*', 'https://claude.ai/share/*']);

const COLORS = { success: '#12805c', warning: '#a15c07', error: '#c62828' };

/** Feedback for actions started outside the popup: a ✓ or ! on the toolbar icon, details in its tooltip. */
async function showOutcome(tabId: number, outcome: ExportOutcome): Promise<void> {
  const kind = !outcome.ok ? 'error' : outcome.warnings.length > 0 ? 'warning' : 'success';
  const detail = !outcome.ok ? outcome.error : outcome.warnings.join(' ') || `Done: ${outcome.messageCount} messages.`;
  await browser.action.setBadgeBackgroundColor({ tabId, color: COLORS[kind] });
  await browser.action.setBadgeText({ tabId, text: kind === 'success' ? '✓' : '!' });
  await browser.action.setTitle({ tabId, title: `Copy Chat: ${detail}` });
  setTimeout(() => {
    void browser.action.setBadgeText({ tabId, text: '' });
    void browser.action.setTitle({ tabId, title: 'Copy Chat' });
  }, kind === 'success' ? 3000 : 10000);
}

async function run(tabId: number, url: string | undefined, action: ExportAction): Promise<void> {
  const failed = (error: string): ExportOutcome => ({ ok: false, error });
  const page = await connectTab(tabId, url).catch(() => null);
  const outcome = page
    ? await requestRun(tabId, action).catch(() => failed('The chat tab stopped responding. Reload it and try again.'))
    : failed(SUPPORTED_SITES_HINT);
  await showOutcome(tabId, outcome);
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    for (const action of EXPORT_ACTIONS) {
      browser.contextMenus.create({
        id: action,
        title: MENU_TITLES[action],
        contexts: ['page', 'selection', 'link', 'image'],
        documentUrlPatterns: CHAT_PAGES,
      });
    }
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const action = EXPORT_ACTIONS.find((candidate) => candidate === info.menuItemId);
    if (action && tab?.id !== undefined) void run(tab.id, tab.url, action);
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'copy-chat' && tab?.id !== undefined) void run(tab.id, tab.url, 'copy');
  });
});
