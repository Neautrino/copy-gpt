# Chrome Web Store listing

Everything to paste into the Chrome Web Store developer dashboard for Copy Chat. Upload `.output/copy-chat-<version>-chrome.zip` (from `pnpm zip`).

## Store listing tab

**Name:** Copy Chat (taken from the manifest)

**Summary** (from the manifest, max 132 characters):

> Copy or export full ChatGPT and Claude conversations as Markdown. Nothing leaves your browser.

**Description:**

```
Copy whole AI conversations, not one message at a time.

Copy Chat copies an entire ChatGPT or Claude conversation as clean Markdown, including the parts that aren't on screen. Paste it into your notes, docs or another AI, or keep it as a backup.

HOW TO USE
• Click the Copy Chat icon on any chat, then Copy chat, Markdown or JSON
• Or right-click the page: Copy chat as Markdown, Download chat as Markdown, Download chat as JSON
• Or press Alt+Shift+C

WHAT YOU GET
• The full conversation, even very long ones
• Only the version you're looking at, without edited or regenerated alternatives
• Code blocks, tables and math kept intact
• Claude artifacts and ChatGPT canvas documents in their final version
• Optional: thinking steps, tool calls and uploaded file text
• Pastes neatly into Google Docs and Notion with formatting

WORKS WITH
ChatGPT (regular, project, custom GPT, shared and signed-out chats) and Claude (regular, project and shared chats).

PRIVATE BY DESIGN
• No account, no server, no tracking
• Your chats go only to your clipboard or your Downloads folder
• Only runs when you click, and only on chatgpt.com and claude.ai
• Open source under the MIT license: https://github.com/Neautrino/copy-gpt

Coming soon: Gemini, Grok, DeepSeek, Perplexity and more, plus images and bulk export.
```

**Category:** Productivity → Tools

**Language:** English

**Graphic assets** (all in this folder):

| Field | File |
|---|---|
| Store icon (128×128) | `public/icon/128.png` |
| Screenshots (1280×800) | `screenshot-1-popup.png`, `screenshot-2-markdown.png`, `screenshot-3-settings.png` |
| Small promo tile (440×280) | `promo-small.png` |

**Official URL:** none (needs a verified domain; optional)

**Homepage URL:** https://copy-gpt.neautrino.space

**Support URL:** https://github.com/Neautrino/copy-gpt/issues

## Privacy tab

**Single purpose description:**

> Copy Chat copies or downloads the ChatGPT or Claude conversation open in the current tab as Markdown or JSON.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's export settings (include thinking, tool calls, file contents, title header). No conversation content is stored. |
| `contextMenus` | Adds "Copy chat as Markdown", "Download chat as Markdown" and "Download chat as JSON" to the right-click menu on ChatGPT and Claude chat pages. |
| `scripting` | Adds the extension's content script to a ChatGPT or Claude tab that was already open before the extension was installed or updated, so the user doesn't have to reload the tab. Only runs on the three chat sites, after the user clicks the extension. |
| Host permissions (`chatgpt.com`, `chat.openai.com`, `claude.ai`) | Reads the conversation the user asks to copy, from the site's own data with the user's existing session or from the page. The extension only reads; it never changes the page. No other sites are accessed. |

**Are you using remote code?** No, I am not using remote code. All JavaScript is bundled in the package.

**Data usage.** Leave every data type unchecked: the extension does not collect or transmit any user data. Conversations are processed locally and only written to the clipboard or a downloaded file.

Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://copy-gpt.neautrino.space/privacy

## Distribution tab

**Visibility:** Public

**Regions:** All regions

**Pricing:** Free
