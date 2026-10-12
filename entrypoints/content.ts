import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { copyToClipboard } from '@/lib/clipboard';
import { downloadFile, exportFileName } from '@/lib/download';
import { markdownToHtml, renderMarkdown } from '@/lib/markdown';
import { isContentRequest, type ContentRequest, type ExportOutcome, type PageStatus, type RenderOutcome } from '@/lib/messages';
import { getSettings } from '@/lib/settings';
import { chatgpt } from '@/lib/sites/chatgpt';
import { claude } from '@/lib/sites/claude';
import { extractConversation, type SiteAdapter } from '@/lib/sites/site';

const SITES: Record<string, SiteAdapter> = {
  'chatgpt.com': chatgpt,
  'chat.openai.com': chatgpt,
  'claude.ai': claude,
};

/** Does the export work in the chat tab, where the site's session and rendered page are available. */
async function handle(adapter: SiteAdapter, request: ContentRequest): Promise<PageStatus | RenderOutcome | ExportOutcome> {
  const url = new URL(location.href);
  if (request.type === 'status') return { site: adapter.id, siteName: adapter.name, onChat: adapter.match(url) !== null };

  try {
    const conversation = await extractConversation(adapter, url);
    const { warnings } = conversation;

    if (request.type === 'run' && request.action === 'json') {
      const json = JSON.stringify({ ...conversation, exportedAt: new Date().toISOString() }, null, 2);
      downloadFile(exportFileName(conversation, 'json'), json, 'application/json;charset=utf-8');
      return { ok: true, messageCount: conversation.messages.length, warnings };
    }

    const { markdown, messageCount } = renderMarkdown(conversation, await getSettings());
    if (request.type === 'render') return { ok: true, messageCount, warnings, markdown, html: markdownToHtml(markdown) };
    if (request.action === 'markdown') {
      downloadFile(exportFileName(conversation, 'md'), markdown, 'text/markdown;charset=utf-8');
    } else {
      await copyToClipboard(Promise.resolve({ text: markdown, html: markdownToHtml(markdown) }));
    }
    return { ok: true, messageCount, warnings };
  } catch (error) {
    console.error('[Copy Chat]', error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*'],

  main(ctx) {
    const adapter = SITES[location.hostname];
    if (!adapter) return;

    const listener = (message: unknown, _sender: unknown, sendResponse: (response: unknown) => void) => {
      if (!isContentRequest(message)) return false;
      void handle(adapter, message).then(sendResponse);
      return true; // Keeps the channel open for the async response.
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(listener));
  },
});
