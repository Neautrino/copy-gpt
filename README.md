# Copy Chat

Browser extension that copies a **whole** ChatGPT or Claude conversation as Markdown in one click, or saves it as a `.md` / `.json` file. Everything runs in your browser; nothing is uploaded.

## Features

- **Toolbar popup:** *Copy chat*, *Markdown* and *JSON* download buttons, plus export settings.
- **Right-click** any ChatGPT or Claude chat: *Copy chat as Markdown*, *Download chat as Markdown*, *Download chat as JSON*. A ✓ or ! on the toolbar icon shows the result (hover it for details).
- `Alt+Shift+C` copies the current chat (change it at `chrome://extensions/shortcuts`).
- Copies Markdown as plain text **and** formatted HTML, so pasting into Docs/Notion keeps headings, lists and code.
- Gets the full conversation from the site's own data (not just what's on screen), including:
  - only the branch you are looking at after edits and regenerations,
  - Claude artifacts and ChatGPT canvas documents, in their final version,
  - optional thinking, tool calls and uploaded file contents (toggle in the popup).
- Falls back to reading the page if the site's data can't be loaded, and says so in the copy when messages may be missing.

## Supported sites

| Site | Chats | Shared links |
|---|---|---|
| chatgpt.com | `/c/…`, custom GPT and project chats, signed-out `/uc/…` chats | `/share/…` (works signed out) |
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
  content.ts            Runs in chat tabs: builds the export, copies or downloads it on request
  background.ts         Right-click menu, keyboard shortcut, toolbar badge
  popup/                Toolbar popup: actions and export settings
  chatgpt-share.content.ts  Page-world helper: reads the chat embedded in ChatGPT share pages
lib/
  messages.ts           Popup/background ↔ chat tab messages
  conversation.ts       Site-independent conversation model
  sites/chatgpt.ts      GET /backend-api/conversation/{id}, walks current_node → root
  sites/claude.ts       GET /api/organizations/{org}/chat_conversations/{id}?tree=True…
  markdown.ts           Conversation → Markdown (+ HTML for the clipboard)
  html-to-markdown.ts   Page fallback: rendered HTML → Markdown (KaTeX, code, tables)
```

Requests go to the same site you are on, with your existing session, only when you ask for an export. Permissions: `storage` (settings) and `contextMenus` (right-click items); site access comes from the content-script matches.

These endpoints are undocumented and can change. When an API response looks wrong, the extension falls back to the page and adds a note to the export. Update the adapter in `lib/sites/` when a site changes.

## Known limits

- ChatGPT temporary chats aren't supported (their id never appears in the URL).
- Signed-out ChatGPT chats aren't stored by ChatGPT, so they are read from the page.
- Images are written as `*[Image]*` placeholders; image files aren't downloaded.
- ChatGPT and Claude keep only nearby messages on the page, so the page fallback can miss earlier messages; the export says when that happened.
