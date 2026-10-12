import { defineContentScript } from 'wxt/utils/define-content-script';
import { serveShareData } from '@/lib/sites/chatgpt-share-bridge';

// Page-world helper: lets the main content script read the conversation embedded in share pages.
export default defineContentScript({
  matches: ['https://chatgpt.com/share/*', 'https://chat.openai.com/share/*'],
  world: 'MAIN',
  main() {
    serveShareData(location.pathname);
  },
});
