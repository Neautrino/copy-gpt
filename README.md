# Copy Chat

Browser extension that copies a **whole** ChatGPT or Claude conversation as Markdown in one click, or saves it as a `.md` / `.json` file. Everything runs in your browser; nothing is uploaded.

## Features

- **Copy chat** button in the top-right corner of every chat, plus `Alt+Shift+C` (`⌥⇧C` on macOS).
- Copies Markdown as plain text **and** formatted HTML, so pasting into Docs/Notion keeps headings, lists and code.
- Gets the full conversation from the site's own data (not just what's on screen), including:
  - only the branch you are looking at after edits and regenerations,
  - Claude artifacts and ChatGPT canvas documents, in their final version,
  - optional thinking, tool calls and uploaded file contents (toggle in the menu or the toolbar popup).
- Falls back to reading the page if the site's data can't be loaded, and says so in the copy when messages may be missing.
- Matches the site's light/dark theme.

## Supported sites

| Site | Chats | Shared links |
|---|---|---|
| chatgpt.com | `/c/…`, custom GPT and project chats | `/share/…` (works signed out) |
| claude.ai | `/chat/…`, project chats | `/share/…` (needs sign-in) |

## Development

Requires Node 20+ and pnpm.

```sh
pnpm install
pnpm dev               # Chrome with the extension loaded and auto-reload
pnpm dev:firefox       # Firefox (MV3)
pnpm test              # unit tests
pnpm compile           # type-check
pnpm build             # .output/chrome-mv3
pnpm build:firefox     # .output/firefox-mv3
pnpm zip && pnpm zip:firefox   # store-ready zips
```

Load a build manually: `chrome://extensions` → Developer mode → **Load unpacked** → `.output/chrome-mv3`.

## How it works

```
entrypoints/
  content/              Content script: button UI, copy/download actions, shortcut
  chatgpt-share.content.ts  Page-world helper: reads the chat embedded in ChatGPT share pages
  popup/                Toolbar popup with export settings
components/             Button + menu (rendered in a shadow root so site CSS can't affect it)
lib/
  conversation.ts       Site-independent conversation model
  sites/chatgpt.ts      GET /backend-api/conversation/{id}, walks current_node → root
  sites/claude.ts       GET /api/organizations/{org}/chat_conversations/{id}?tree=True…
  markdown.ts           Conversation → Markdown (+ HTML for the clipboard)
  html-to-markdown.ts   Page fallback: rendered HTML → Markdown (KaTeX, code, tables)
```

Requests go to the same site you are on, with your existing session, only when you click. The only permission is `storage` (for settings); site access comes from the content-script matches.

These endpoints are undocumented and can change. When an API response looks wrong, the extension falls back to the page and adds a note to the export. Update the adapter in `lib/sites/` when a site changes.

## Known limits

- ChatGPT temporary chats aren't supported (their id never appears in the URL).
- Images are written as `*[Image]*` placeholders; image files aren't downloaded.
- ChatGPT and Claude keep only nearby messages on the page, so the page fallback can miss earlier messages; the export says when that happened.
