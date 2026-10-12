import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'Copy Chat',
    description:
      'Copy or export full ChatGPT and Claude conversations as Markdown. Nothing leaves your browser.',
    // Settings only; site access comes from the content script matches.
    permissions: ['storage'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'copy-chat@ssubhendu988',
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
});
