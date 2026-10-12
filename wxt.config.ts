import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'Copy Chat',
    description:
      'Copy or export full ChatGPT and Claude conversations as Markdown. Nothing leaves your browser.',
    // `storage`: settings. `contextMenus`: right-click items. `scripting` + host permissions: add the
    // content script to chat tabs that were open before install/update. The hosts are the same ones the
    // content script already runs on, so Chrome shows no extra install warning.
    permissions: ['storage', 'contextMenus', 'scripting'],
    host_permissions: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*'],
    commands: {
      'copy-chat': {
        suggested_key: { default: 'Alt+Shift+C' },
        description: 'Copy the current chat as Markdown',
      },
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'copy-chat@neautrino',
          // `data_collection_permissions` (required for new AMO listings) is supported from 140 (ESR).
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
        gecko_android: {
          strict_min_version: '142.0',
        },
      },
    }),
  }),
  // The landing page in site/ isn't part of the extension; keep it out of the AMO source zip.
  zip: {
    excludeSources: ['site/**', '.github/**'],
  },
});
