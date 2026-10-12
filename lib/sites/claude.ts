import {
  ArtifactFolder,
  languageFromPath,
  pushMessage,
  type Conversation,
  type Message,
  type Part,
  type Role,
} from '../conversation';
import { htmlToMarkdown } from '../html-to-markdown';
import { getJson, readCookie } from '../http';
import type { SiteAdapter } from './site';

// Shapes of claude.ai's internal /api responses; only the fields we read.
interface ClaudeBlock {
  type: string;
  id?: string;
  text?: string;
  thinking?: string;
  name?: string;
  integration_name?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
  citations?: { url?: string; title?: string }[];
}

interface ClaudeMessage {
  uuid: string;
  parent_message_uuid?: string | null;
  index?: number;
  sender: string;
  created_at?: string;
  text?: string;
  content?: ClaudeBlock[];
  attachments?: { file_name?: string; extracted_content?: string }[];
  files?: { file_kind?: string; file_name?: string }[];
}

export interface ClaudeConversationData {
  name?: string;
  snapshot_name?: string;
  model?: string | null;
  created_at?: string;
  updated_at?: string;
  current_leaf_message_uuid?: string | null;
  chat_messages: ClaudeMessage[];
}

function isConversationData(value: unknown): value is ClaudeConversationData {
  return !!value && typeof value === 'object' && 'chat_messages' in value && Array.isArray(value.chat_messages);
}

/** The API returns every branch (edits, retries); keep the path ending at the current leaf. */
function activeBranch(data: ClaudeConversationData): ClaudeMessage[] {
  const byId = new Map(data.chat_messages.map((message) => [message.uuid, message]));
  let message = data.current_leaf_message_uuid ? byId.get(data.current_leaf_message_uuid) : undefined;
  if (!message) return [...data.chat_messages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const branch: ClaudeMessage[] = [];
  const seen = new Set<string>();
  while (message && !seen.has(message.uuid)) {
    seen.add(message.uuid);
    branch.push(message);
    message = message.parent_message_uuid ? byId.get(message.parent_message_uuid) : undefined;
  }
  return branch.reverse();
}

const ARTIFACT_LANGUAGES: Record<string, string> = {
  'text/markdown': 'markdown',
  'text/html': 'html',
  'image/svg+xml': 'svg',
  'application/vnd.ant.mermaid': 'mermaid',
  'application/vnd.ant.react': 'jsx',
};

function toolUseParts(block: ClaudeBlock, folder: ArtifactFolder, warnings: string[]): Part[] {
  const input: object = block.input && typeof block.input === 'object' ? block.input : {};
  const field = (key: string): string | undefined => {
    const value: unknown = Reflect.get(input, key);
    return typeof value === 'string' ? value : undefined;
  };
  const replaceOnce = (oldText: string, newText: string) => (previous: string) => {
    if (!previous.includes(oldText)) {
      warnings.push('An edit to a document could not be matched, so a document may not match its final version.');
      return previous;
    }
    // Function replacer: `$&` and friends in the new text must stay literal.
    return previous.replace(oldText, () => newText);
  };

  if (block.name === 'artifacts') {
    const id = field('id');
    const command = field('command');
    const key = `artifact:${id}`;
    if (id && (command === 'create' || command === 'rewrite')) {
      const type = field('type');
      return [
        folder.apply(key, {
          title: field('title'),
          language: field('language') ?? (type ? ARTIFACT_LANGUAGES[type] : undefined),
          content: field('content') ?? '',
        }),
      ];
    }
    if (id && command === 'update' && folder.has(key)) {
      return [folder.apply(key, { edit: replaceOnce(field('old_str') ?? '', field('new_str') ?? '') })];
    }
    return [];
  }

  const path = field('path');
  if (block.name === 'create_file' && path && field('file_text') !== undefined) {
    return [folder.apply(`file:${path}`, { title: path, language: languageFromPath(path), content: field('file_text') })];
  }
  if (block.name === 'str_replace' && path && folder.has(`file:${path}`)) {
    return [folder.apply(`file:${path}`, { edit: replaceOnce(field('old_str') ?? '', field('new_str') ?? '') })];
  }
  const widget = field('widget_code');
  if (block.name?.endsWith('show_widget') && widget) {
    const key = `widget:${block.id ?? widget}`;
    return [folder.apply(key, { title: field('title') ?? 'Widget', language: 'html', content: widget })];
  }

  const name = block.name ?? 'tool';
  return [
    {
      type: 'tool_call',
      name: block.integration_name ? `${block.integration_name}: ${name}` : name,
      input: JSON.stringify(block.input ?? {}, null, 2),
      language: 'json',
    },
  ];
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((item: unknown) => (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string' ? item.text : ''))
    .filter(Boolean)
    .join('\n\n');
}

function messageParts(message: ClaudeMessage, folder: ArtifactFolder, warnings: string[]): Part[] {
  const parts: Part[] = [];
  for (const attachment of message.attachments ?? []) {
    parts.push({ type: 'attachment', name: attachment.file_name ?? 'file', text: attachment.extracted_content });
  }
  for (const file of message.files ?? []) {
    parts.push(file.file_kind === 'image' ? { type: 'image', name: file.file_name } : { type: 'attachment', name: file.file_name ?? 'file' });
  }

  const sources = new Map<string, string>();
  for (const block of message.content ?? []) {
    switch (block.type) {
      case 'text':
        if (block.text?.trim()) parts.push({ type: 'text', text: block.text });
        for (const citation of block.citations ?? []) {
          if (citation.url) sources.set(citation.url, citation.title || citation.url);
        }
        break;
      case 'thinking':
        if (block.thinking?.trim()) parts.push({ type: 'thinking', text: block.thinking });
        break;
      case 'tool_use':
        parts.push(...toolUseParts(block, folder, warnings));
        break;
      case 'tool_result':
        // Artifact tool results are just "OK" acknowledgements.
        if (block.name !== 'artifacts') {
          parts.push({ type: 'tool_result', name: block.name, text: toolResultText(block.content), isError: block.is_error });
        }
        break;
    }
  }
  if (!message.content?.length && message.text?.trim()) parts.push({ type: 'text', text: message.text });
  if (sources.size > 0) {
    const list = [...sources].map(([url, title]) => `- [${title.replace(/[[\]]/g, '')}](${url})`).join('\n');
    parts.push({ type: 'text', text: `Sources:\n${list}` });
  }
  return parts;
}

export function parseClaudeConversation(data: ClaudeConversationData, chat: { id: string; url: string }): Conversation {
  const folder = new ArtifactFolder();
  const warnings: string[] = [];
  const messages: Message[] = [];
  for (const message of activeBranch(data)) {
    const role: Role = message.sender === 'human' ? 'user' : 'assistant';
    const parts = messageParts(message, folder, warnings);
    if (parts.length === 0) continue;
    pushMessage(messages, {
      id: message.uuid,
      role,
      createdAt: message.created_at,
      model: role === 'assistant' ? (data.model ?? undefined) : undefined,
      parts,
    });
  }
  return {
    site: 'claude',
    siteName: 'Claude',
    id: chat.id,
    title: (data.name ?? data.snapshot_name)?.trim() || 'Untitled chat',
    url: chat.url,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    source: 'api',
    messages: folder.finalize(messages),
    warnings: [...new Set(warnings)],
  };
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const CHAT_PATH = new RegExp(`^/(chat|share)/(${UUID})`, 'i');
const QUERY = 'rendering_mode=messages&render_all_tools=true';

async function organizationId(): Promise<string> {
  const fromCookie = readCookie('lastActiveOrg');
  if (fromCookie) return fromCookie;
  const organizations = await getJson<{ uuid?: string }[]>('/api/organizations');
  const id = organizations[0]?.uuid;
  if (!id) throw new Error('Sign in to Claude to copy this chat.');
  return id;
}

export const claude: SiteAdapter = {
  id: 'claude',
  name: 'Claude',

  match(url) {
    const match = CHAT_PATH.exec(url.pathname);
    if (!match?.[1] || !match[2]) return null;
    return { kind: match[1].toLowerCase() === 'share' ? 'share' : 'chat', id: match[2] };
  },

  async fetchConversation(target, url) {
    const data =
      target.kind === 'share'
        ? await getJson(`/api/chat_snapshots/${target.id}?${QUERY}`)
        : await getJson(`/api/organizations/${await organizationId()}/chat_conversations/${target.id}?tree=True&${QUERY}`);
    if (!isConversationData(data)) throw new Error('Claude returned data in an unexpected format.');
    return parseClaudeConversation(data, { id: target.id, url: url.href });
  },

  readPage(target, url) {
    const messages: Message[] = [];
    for (const node of document.querySelectorAll('[data-testid="user-message"], .font-claude-response')) {
      if (node.parentElement?.closest('.font-claude-response')) continue;
      const role: Role = node.matches('[data-testid="user-message"]') ? 'user' : 'assistant';
      const text = role === 'user' ? (node.textContent?.trim() ?? '') : htmlToMarkdown(node);
      if (text) pushMessage(messages, { id: `message-${messages.length}`, role, parts: [{ type: 'text', text }] });
    }
    return {
      site: 'claude',
      siteName: 'Claude',
      id: target.id,
      title: document.title.replace(/\s*[-|]\s*Claude$/, '').trim() || 'Untitled chat',
      url: url.href,
      source: 'page',
      messages,
      warnings: ['Claude only keeps nearby messages on the page, so earlier messages may be missing.'],
    };
  },
};
