# Copy Chat

Copy a **whole** ChatGPT or Claude conversation as clean Markdown in one click, or save it as a `.md` or `.json` file.

The built-in copy buttons copy one message at a time. Copy Chat copies the entire conversation, including the parts that aren't on screen, so you can paste it into notes, docs, another AI, or keep it as a backup.

**Website:** [copy-gpt.neautrino.space](https://copy-gpt.neautrino.space)

## Using it

On a ChatGPT or Claude chat, any of these work:

- Click the **Copy Chat** icon in the toolbar, then **Copy chat**, **Markdown** or **JSON**.
- **Right-click** the page and choose *Copy chat as Markdown*, *Download chat as Markdown* or *Download chat as JSON*.
- Press **Alt+Shift+C** to copy the chat. You can change the key at `chrome://extensions/shortcuts`.

In the toolbar popup you can choose what to include: thinking steps, tool calls, the text of uploaded files, and a title-and-link header.

Works on:

- **ChatGPT**: regular chats, project and custom GPT chats, shared links, and chats while signed out.
- **Claude**: regular chats, project chats and shared links.

## How it works

1. When you ask for a copy, the extension reads the conversation the same way the site's own page does: it requests the chat from the site you're on (chatgpt.com or claude.ai), using your existing login.
2. It keeps only the version of the chat you're looking at. If you edited a message or regenerated a reply, the other versions are left out.
3. It turns the conversation into Markdown: your messages, the replies, code blocks, tables and math. Claude artifacts and ChatGPT canvas documents are included in their final version.
4. The result goes to your clipboard, both as Markdown and as formatted text so it pastes well into Google Docs or Notion, or into a file in your Downloads folder.

If the site's data can't be loaded, Copy Chat falls back to reading the messages shown on the page. It adds a note to the copy when some messages may be missing.

## Permissions

| Permission | Why it's needed |
|---|---|
| Access to `chatgpt.com`, `chat.openai.com` and `claude.ai` | To read the chat you ask it to copy. Chrome shows this as "Read and change your data on these sites". Copy Chat only reads; it never changes the page. |
| `scripting` | To start working in a chat tab that was already open before you installed or updated the extension, so you don't have to reload the tab. |
| `contextMenus` | To add the right-click menu items. |
| `storage` | To remember your settings (what to include in exports). |

It has no access to any other website, your browsing history or your other tabs.

## Security and privacy

- **Nothing leaves your browser.** There is no server, no account, no analytics and no tracking. Your chats go only to your clipboard or a file you download.
- **Only when you ask.** The extension contacts ChatGPT or Claude only when you click Copy or Download, and only for the chat in front of you. It never runs in the background or downloads your chat history.
- **Your login stays with the site.** Requests use the session you already have on chatgpt.com or claude.ai. Copy Chat doesn't store passwords, cookies or tokens.
- **No remote code.** Everything it runs ships inside the extension, as the Chrome and Firefox stores require.
- **Open source.** The full code is in this repository under the MIT license.

Found a security problem? Please open an issue in this repository.

## Roadmap

- [x] ChatGPT and Claude
- [x] Copy as Markdown, download as Markdown or JSON
- [ ] More AI platforms: Gemini, Grok, DeepSeek, Perplexity, Microsoft Copilot, Mistral Le Chat and other chat sites
- [ ] Images in exports
- [ ] Bulk export (many chats into one `.zip`)
- [ ] Clean up ChatGPT's interactive layouts (cards, quizzes, citations)
- [ ] ChatGPT temporary chats
- [ ] PDF and HTML export

## Install from source

Requires Node 20+ and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and select the `.output/chrome-mv3` folder.

For development:

```sh
pnpm dev            # opens Chrome with the extension and reloads on changes
pnpm test           # unit tests
pnpm compile        # type-check
pnpm zip            # store-ready zip (pnpm zip:firefox for Firefox)
```
