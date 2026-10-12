import './style.css';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createCopyButton, type CopyButton, type DownloadFormat, type Theme } from '@/components/copy-button';
import { copyToClipboard } from '@/lib/clipboard';
import type { Conversation } from '@/lib/conversation';
import { downloadFile, exportFileName } from '@/lib/download';
import { markdownToHtml, renderMarkdown } from '@/lib/markdown';
import { getSettings, setSetting, watchSettings } from '@/lib/settings';
import { chatgpt } from '@/lib/sites/chatgpt';
import { claude } from '@/lib/sites/claude';
import { extractConversation, type SiteAdapter } from '@/lib/sites/site';

const SITES: Record<string, SiteAdapter> = {
  'chatgpt.com': chatgpt,
  'chat.openai.com': chatgpt,
  'claude.ai': claude,
};

/** Matches the button to the site's light/dark theme by measuring the page background. */
function detectTheme(): Theme {
  for (const element of [document.body, document.documentElement]) {
    const color = getComputedStyle(element).backgroundColor;
    const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(color);
    if (rgb && (rgb[4] === undefined || Number(rgb[4]) > 0.5)) {
      const luminance = 0.2126 * Number(rgb[1]) + 0.7152 * Number(rgb[2]) + 0.0722 * Number(rgb[3]);
      return luminance < 128 ? 'dark' : 'light';
    }
    const oklch = /oklch\(\s*([\d.]+)(%?)/.exec(color);
    if (oklch?.[1]) return Number(oklch[1]) / (oklch[2] ? 100 : 1) < 0.5 ? 'dark' : 'light';
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const site = SITES[location.hostname];
    if (!site) return;
    const adapter: SiteAdapter = site;

    let options = await getSettings();
    let busy = false;

    const ui = await createShadowRootUi<CopyButton>(ctx, {
      name: 'copy-chat-button',
      position: 'inline',
      anchor: 'body',
      isolateEvents: true,
      onMount: (container) => {
        const button = createCopyButton(container, {
          onCopy: copy,
          onDownload: download,
          onToggle: (key, value) => void setSetting(key, value),
        });
        button.setOptions(options);
        button.setTheme(detectTheme());
        return button;
      },
      onRemove: (button) => button?.destroy(),
    });

    const onChatPage = () => adapter.match(new URL(location.href)) !== null;

    function report(conversation: Conversation, verb: string, count: number) {
      const label = `${verb} ${count} message${count === 1 ? '' : 's'}`;
      if (conversation.warnings.length > 0) ui.mounted?.warn(label, conversation.warnings.join(' '));
      else ui.mounted?.success(label);
    }

    function fail(label: string, error: unknown) {
      console.error('[Copy Chat]', error);
      ui.mounted?.fail(label, error instanceof Error ? error.message : String(error));
    }

    // Everything up to `copyToClipboard` runs synchronously so the browser still sees the user's click.
    function copy() {
      if (busy || !onChatPage()) return;
      busy = true;
      ui.mounted?.busy('Copying…');
      const exportOptions = options;
      const rendered = extractConversation(adapter, new URL(location.href)).then((conversation) => ({
        conversation,
        ...renderMarkdown(conversation, exportOptions),
      }));
      copyToClipboard(rendered.then(({ markdown }) => ({ text: markdown, html: markdownToHtml(markdown) })))
        .then(() => rendered)
        .then(({ conversation, messageCount }) => report(conversation, 'Copied', messageCount))
        .catch((error: unknown) => fail('Couldn’t copy', error))
        .finally(() => (busy = false));
    }

    async function download(format: DownloadFormat) {
      if (busy || !onChatPage()) return;
      busy = true;
      ui.mounted?.busy('Preparing…');
      try {
        const conversation = await extractConversation(adapter, new URL(location.href));
        if (format === 'markdown') {
          const { markdown, messageCount } = renderMarkdown(conversation, options);
          downloadFile(exportFileName(conversation, 'md'), markdown, 'text/markdown;charset=utf-8');
          report(conversation, 'Saved', messageCount);
        } else {
          const json = JSON.stringify({ ...conversation, exportedAt: new Date().toISOString() }, null, 2);
          downloadFile(exportFileName(conversation, 'json'), json, 'application/json;charset=utf-8');
          report(conversation, 'Saved', conversation.messages.length);
        }
      } catch (error) {
        fail('Couldn’t save', error);
      } finally {
        busy = false;
      }
    }

    // Show the button only on chat pages; both sites navigate without reloading. The event fires
    // before `location` updates, so use the URL it carries.
    const sync = (url: URL) => {
      const shouldShow = adapter.match(url) !== null;
      if (shouldShow && !ui.shadowHost.isConnected) ui.mount();
      else if (!shouldShow && ui.mounted) ui.remove();
    };
    sync(new URL(location.href));
    ctx.addEventListener(window, 'wxt:locationchange', (event) => sync(event.newUrl));

    // The sites re-render <body> content; put the button back if it gets removed.
    const bodyObserver = new MutationObserver(() => {
      if (ui.mounted && !ui.shadowHost.isConnected) ui.mount();
    });
    bodyObserver.observe(document.body, { childList: true });

    const updateTheme = () => ui.mounted?.setTheme(detectTheme());
    const themeObserver = new MutationObserver(updateTheme);
    for (const element of [document.documentElement, document.body]) {
      themeObserver.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-mode'] });
    }
    const colorScheme = matchMedia('(prefers-color-scheme: dark)');
    ctx.addEventListener(colorScheme, 'change', updateTheme);

    const unwatchSettings = watchSettings((next) => {
      options = next;
      ui.mounted?.setOptions(next);
    });

    // Alt+Shift+C copies the chat from anywhere on the page.
    ctx.addEventListener(
      document,
      'keydown',
      (event: KeyboardEvent) => {
        if (event.code !== 'KeyC' || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
        if (!onChatPage()) return;
        event.preventDefault();
        event.stopPropagation();
        copy();
      },
      { capture: true },
    );

    ctx.onInvalidated(() => {
      bodyObserver.disconnect();
      themeObserver.disconnect();
      unwatchSettings();
    });
  },
});
