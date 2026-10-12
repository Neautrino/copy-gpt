import { ArtifactFolder, pushMessage, type Conversation, type Message, type Part, type Role } from '../conversation';
import { htmlToMarkdown } from '../html-to-markdown';
import { getJson, readCookie } from '../http';
import { requestShareData } from './chatgpt-share-bridge';
import type { SiteAdapter } from './site';

// Shapes of chatgpt.com's internal /backend-api responses; only the fields we read.
interface ContentReference {
  matched_text?: string;
  alt?: string | null;
}

interface ChatGPTContent {
  content_type: string;
  parts?: unknown[];
  text?: string;
  language?: string;
  thoughts?: { summary?: string; content?: string }[];
  result?: string;
  title?: string;
  url?: string;
}

interface ChatGPTMessage {
  id: string;
  author: { role: string; name?: string | null };
  create_time?: number | null;
  content: ChatGPTContent;
  recipient?: string;
  metadata?: {
    model_slug?: string;
    is_visually_hidden_from_conversation?: boolean;
    is_thinking_preamble_message?: boolean;
    content_references?: ContentReference[];
    attachments?: { name?: string }[];
  };
}

interface ChatGPTNode {
  id: string;
  parent?: string | null;
  children?: string[];
  message?: ChatGPTMessage | null;
}

export interface ChatGPTConversationData {
  title?: string | null;
  create_time?: number | null;
  update_time?: number | null;
  current_node?: string | null;
  mapping: Record<string, ChatGPTNode>;
}

function isConversationData(value: unknown): value is ChatGPTConversationData {
  return !!value && typeof value === 'object' && 'mapping' in value && !!value.mapping && typeof value.mapping === 'object';
}

function isoFromSeconds(seconds: number | null | undefined): string | undefined {
  return typeof seconds === 'number' && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : undefined;
}

/** Messages on the branch the user currently sees: from `current_node` up to the root. */
function visibleBranch(data: ChatGPTConversationData): ChatGPTMessage[] {
  const { mapping } = data;
  let id: string | null | undefined =
    data.current_node && mapping[data.current_node]
      ? data.current_node
      : Object.values(mapping).findLast((node) => !node.children?.length)?.id;
  const branch: ChatGPTMessage[] = [];
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const node: ChatGPTNode | undefined = mapping[id];
    if (!node) break;
    if (node.message) branch.push(node.message);
    id = node.parent;
  }
  return branch.reverse();
}

const CITATION_MARKER = /[\uE200-\uE206]|【/;

/** Replaces inline citation markers with the Markdown links ChatGPT pre-formats in `alt`. */
function resolveCitations(text: string, references: ContentReference[] = []): string {
  const markers = references
    .filter((reference): reference is ContentReference & { matched_text: string } =>
      !!reference.matched_text && CITATION_MARKER.test(reference.matched_text),
    )
    .sort((a, b) => b.matched_text.length - a.matched_text.length);
  let resolved = text;
  for (const reference of markers) resolved = resolved.split(reference.matched_text).join(reference.alt ?? '');
  return resolved
    .replace(/\uE200[^\uE201]*\uE201/g, '')
    .replace(/[\uE200-\uE206]/g, '')
    .replace(/【\d+(?::\d+)?†[^】]*】/g, '');
}

function contentParts(content: ChatGPTContent, references?: ContentReference[]): Part[] {
  const parts: Part[] = [];
  for (const item of content.parts ?? []) {
    if (typeof item === 'string') {
      const text = resolveCitations(item, references);
      if (text.trim()) parts.push({ type: 'text', text });
    } else if (item && typeof item === 'object' && 'content_type' in item) {
      if (item.content_type === 'image_asset_pointer') parts.push({ type: 'image' });
      else if (item.content_type === 'audio_transcription' && 'text' in item && typeof item.text === 'string') {
        parts.push({ type: 'text', text: item.text });
      }
    }
  }
  if (parts.length === 0 && typeof content.text === 'string' && content.text.trim()) {
    parts.push({ type: 'text', text: resolveCitations(content.text, references) });
  }
  return parts;
}

function rawText(content: ChatGPTContent): string {
  if (typeof content.text === 'string') return content.text;
  return (content.parts ?? []).filter((part): part is string => typeof part === 'string').join('\n');
}

interface CanvasState {
  folder: ArtifactFolder;
  key?: string;
  created: number;
  warnings: string[];
}

/** Canvas documents are written through `canmore.*` tool calls; rebuild the final text from them. */
function canvasParts(recipient: string, raw: string, canvas: CanvasState): Part[] {
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return [{ type: 'tool_call', name: recipient, input: raw }];
  }
  if (!input || typeof input !== 'object') return [];
  const command = recipient.slice('canmore.'.length);

  if (command === 'create_textdoc' && 'content' in input && typeof input.content === 'string') {
    const name = 'name' in input && typeof input.name === 'string' ? input.name : 'Canvas';
    const type = 'type' in input && typeof input.type === 'string' ? input.type : '';
    canvas.key = `canvas:${++canvas.created}`;
    const language = type.startsWith('code/') ? type.slice('code/'.length) : 'markdown';
    return [canvas.folder.apply(canvas.key, { title: name, language, content: input.content })];
  }
  if (command === 'rewrite_textdoc' && canvas.key && 'content' in input && typeof input.content === 'string') {
    return [canvas.folder.apply(canvas.key, { content: input.content })];
  }
  if (command === 'update_textdoc' && canvas.key && 'updates' in input && Array.isArray(input.updates)) {
    const updates: unknown[] = input.updates;
    return [
      canvas.folder.apply(canvas.key, {
        edit: (previous) => {
          let next = previous;
          for (const update of updates) {
            if (!update || typeof update !== 'object' || !('pattern' in update) || typeof update.pattern !== 'string') continue;
            const replacement = 'replacement' in update && typeof update.replacement === 'string' ? update.replacement : '';
            const global = 'multiple' in update && update.multiple === true;
            try {
              next = next.replace(new RegExp(update.pattern, global ? 'g' : ''), replacement);
            } catch {
              canvas.warnings.push('A canvas edit could not be applied, so a canvas may not match its final version.');
            }
          }
          return next;
        },
      }),
    ];
  }
  return [];
}

function convertMessage(message: ChatGPTMessage, canvas: CanvasState): { role: Role; parts: Part[] } | null {
  const { author, content } = message;
  const metadata = message.metadata ?? {};
  const recipient = message.recipient ?? 'all';
  if (author.role === 'system' || metadata.is_visually_hidden_from_conversation || metadata.is_thinking_preamble_message) {
    return null;
  }
  if (content.content_type === 'user_editable_context' || content.content_type === 'model_editable_context') return null;
  const raw = rawText(content);

  if (author.role === 'user') {
    const attachments: Part[] = (metadata.attachments ?? []).map((file) => ({ type: 'attachment', name: file.name ?? 'file' }));
    return { role: 'user', parts: [...attachments, ...contentParts(content)] };
  }

  if (author.role === 'assistant') {
    if (recipient.startsWith('canmore.')) return { role: 'assistant', parts: canvasParts(recipient, raw, canvas) };
    if (recipient !== 'all' || content.content_type === 'code') {
      const language = content.language && content.language !== 'unknown' ? content.language : /^\s*[{[]/.test(raw) ? 'json' : undefined;
      return { role: 'assistant', parts: [{ type: 'tool_call', name: recipient === 'all' ? 'code' : recipient, input: raw, language }] };
    }
    if (content.content_type === 'thoughts') {
      const thoughts = (content.thoughts ?? [])
        .map((thought) => [thought.summary, thought.content].filter(Boolean).join('\n\n'))
        .filter(Boolean);
      return { role: 'assistant', parts: thoughts.length ? [{ type: 'thinking', text: thoughts.join('\n\n') }] : [] };
    }
    if (content.content_type === 'reasoning_recap') return null;
    return { role: 'assistant', parts: contentParts(content, metadata.content_references) };
  }

  // Tool output (search results, code execution, generated images).
  if (author.name?.startsWith('canmore.')) return null;
  const images = contentParts(content).filter((part) => part.type === 'image');
  const text =
    content.content_type === 'tether_quote'
      ? [content.title, content.url, content.text].filter(Boolean).join('\n')
      : content.content_type === 'tether_browsing_display'
        ? content.result ?? ''
        : raw;
  const result: Part[] = text.trim() ? [{ type: 'tool_result', name: author.name ?? undefined, text }] : [];
  return { role: 'assistant', parts: [...result, ...images] };
}

export function parseChatGPTConversation(data: ChatGPTConversationData, chat: { id: string; url: string }): Conversation {
  const canvas: CanvasState = { folder: new ArtifactFolder(), created: 0, warnings: [] };
  const messages: Message[] = [];
  for (const message of visibleBranch(data)) {
    const converted = convertMessage(message, canvas);
    if (!converted || converted.parts.length === 0) continue;
    pushMessage(messages, {
      id: message.id,
      role: converted.role,
      createdAt: isoFromSeconds(message.create_time),
      model: converted.role === 'assistant' ? message.metadata?.model_slug : undefined,
      parts: converted.parts,
    });
  }
  return {
    site: 'chatgpt',
    siteName: 'ChatGPT',
    id: chat.id,
    title: data.title?.trim() || 'Untitled chat',
    url: chat.url,
    createdAt: isoFromSeconds(data.create_time),
    updatedAt: isoFromSeconds(data.update_time),
    source: 'api',
    messages: canvas.folder.finalize(messages),
    warnings: [...new Set(canvas.warnings)],
  };
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SHARE_PATH = new RegExp(`^/share/(?:e/)?(${UUID})`, 'i');
const CHAT_PATH = new RegExp(`/c/(${UUID})`, 'i');
/** Signed-out chats: ChatGPT doesn't store them, so they exist only in the open tab. */
const UNSAVED_PATH = new RegExp(`^/uc/(${UUID})`, 'i');

async function fetchAuthorized(chatId: string): Promise<unknown> {
  const session = await getJson<{ accessToken?: string }>('/api/auth/session');
  if (!session.accessToken) throw new Error('Sign in to ChatGPT to copy this chat.');
  const headers: Record<string, string> = { authorization: `Bearer ${session.accessToken}` };

  // Team/Enterprise chats also need the workspace account id.
  const workspace = readCookie('_account');
  if (workspace && workspace !== 'personal') {
    const check = await getJson<{ accounts?: Record<string, { account?: { account_id?: string } }> }>(
      '/backend-api/accounts/check/v4-2023-04-27',
      headers,
    ).catch(() => undefined);
    const accountId = check?.accounts?.[workspace]?.account?.account_id;
    if (accountId) headers['chatgpt-account-id'] = accountId;
  }
  return getJson(`/backend-api/conversation/${chatId}`, headers);
}

export const chatgpt: SiteAdapter = {
  id: 'chatgpt',
  name: 'ChatGPT',

  match(url) {
    const share = SHARE_PATH.exec(url.pathname);
    if (share?.[1]) return { kind: 'share', id: share[1] };
    const chat = CHAT_PATH.exec(url.pathname);
    if (chat?.[1]) return { kind: 'chat', id: chat[1] };
    const unsaved = UNSAVED_PATH.exec(url.pathname);
    return unsaved?.[1] ? { kind: 'unsaved', id: unsaved[1] } : null;
  },

  async fetchConversation(target, url) {
    let data: unknown;
    if (target.kind === 'share') {
      // Share pages already contain the conversation; the public share endpoint is the fallback.
      const embedded = await requestShareData();
      data = isConversationData(embedded) ? embedded : await getJson(`/backend-api/share/${target.id}`);
    } else {
      data = await fetchAuthorized(target.id);
    }
    if (!isConversationData(data)) throw new Error('ChatGPT returned data in an unexpected format.');
    return parseChatGPTConversation(data, { id: target.id, url: url.href });
  },

  readPage(target, url) {
    // Signed-in layout: conversation-turn articles. Signed-out (/uc/) layout: a transcript list.
    const turns = [
      ...document.querySelectorAll('[data-testid^="conversation-turn-"], [data-conversation-transcript] > [data-message-role]'),
    ];
    const messages: Message[] = [];
    let missing = 0;
    for (const turn of turns) {
      const author = turn.querySelector('[data-message-author-role]');
      const roleName =
        turn.getAttribute('data-turn') ?? turn.getAttribute('data-message-role') ?? author?.getAttribute('data-message-author-role');
      const role: Role = roleName === 'user' ? 'user' : 'assistant';
      let text = '';
      if (role === 'user') {
        const bubble = turn.querySelector('[data-user-message-bubble]');
        const paragraphs = bubble ? [...bubble.querySelectorAll('p')].map((p) => p.textContent ?? '') : [];
        const body = author?.querySelector('.whitespace-pre-wrap') ?? author ?? bubble;
        text = (paragraphs.length > 0 ? paragraphs.join('\n\n') : (body?.textContent ?? '')).trim();
      } else {
        const body = turn.querySelector('.markdown, [data-assistant-markdown]');
        text = body ? htmlToMarkdown(body) : '';
      }
      // Signed-in ChatGPT unmounts off-screen turns, leaving empty placeholders.
      if (!text) {
        missing++;
        continue;
      }
      pushMessage(messages, {
        id: author?.getAttribute('data-message-id') ?? (turn.id || `turn-${messages.length}`),
        role,
        parts: [{ type: 'text', text }],
      });
    }
    // Named chats put their title in the tab ("ChatGPT - Title"); unnamed ones only show the product name.
    const pageTitle = document.title.replace(/^ChatGPT\s*-\s*/, '').trim();
    const firstPart = messages.find((message) => message.role === 'user')?.parts[0];
    const firstLine = firstPart?.type === 'text' ? firstPart.text.split('\n')[0]!.slice(0, 80) : '';
    return {
      site: 'chatgpt',
      siteName: 'ChatGPT',
      id: target.id,
      title: (pageTitle && !pageTitle.startsWith('ChatGPT') ? pageTitle : firstLine) || 'Untitled chat',
      url: url.href,
      source: 'page',
      messages,
      warnings: missing ? [`${missing} of ${turns.length} messages were not loaded on the page and are missing.`] : [],
    };
  },
};
