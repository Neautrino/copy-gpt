/** Site-agnostic conversation model. Every site adapter produces this; every exporter consumes it. */

export type SiteId = 'chatgpt' | 'claude';
export type Role = 'user' | 'assistant';

export type Part =
  /** Markdown text (assistant) or plain text (user). */
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; name: string; input: string; language?: string }
  | { type: 'tool_result'; name?: string; text: string; isError?: boolean }
  /** Final state of a document the assistant created (Claude artifact, ChatGPT canvas, created file). */
  | { type: 'artifact'; title: string; language?: string; content: string }
  /** Uploaded file. `text` is its extracted content when the site provides it. */
  | { type: 'attachment'; name: string; text?: string }
  | { type: 'image'; name?: string };

export type ArtifactPart = Extract<Part, { type: 'artifact' }>;

export interface Message {
  id: string;
  role: Role;
  createdAt?: string;
  model?: string;
  parts: Part[];
}

export interface Conversation {
  site: SiteId;
  siteName: string;
  id: string;
  title: string;
  url: string;
  createdAt?: string;
  updatedAt?: string;
  /** `api`: complete data from the site's own API. `page`: best-effort read of what is rendered. */
  source: 'api' | 'page';
  messages: Message[];
  /** Shown to the user and written into the export, e.g. when the copy may be incomplete. */
  warnings: string[];
}

/** Appends `parts` to the previous message when it has the same role, so tool steps fold into one turn. */
export function pushMessage(messages: Message[], message: Message): void {
  const last = messages.at(-1);
  if (last && last.role === message.role) {
    last.parts.push(...message.parts);
    last.model ??= message.model;
    return;
  }
  messages.push(message);
}

/**
 * Tracks documents that are created and then edited across several messages, so only the final
 * version is exported, at the position of its last edit.
 */
export class ArtifactFolder {
  private readonly latest = new Map<string, ArtifactPart>();
  private readonly superseded = new Set<ArtifactPart>();

  has(key: string): boolean {
    return this.latest.has(key);
  }

  /** Returns a new part holding the updated content; push it where the edit happened. */
  apply(
    key: string,
    change: { title?: string; language?: string; content?: string; edit?: (previous: string) => string },
  ): ArtifactPart {
    const previous = this.latest.get(key);
    if (previous) this.superseded.add(previous);
    const base = change.content ?? previous?.content ?? '';
    const part: ArtifactPart = {
      type: 'artifact',
      title: change.title || previous?.title || 'Untitled document',
      language: change.language ?? previous?.language,
      content: change.edit ? change.edit(base) : base,
    };
    this.latest.set(key, part);
    return part;
  }

  /** Removes every artifact part that a later edit replaced. */
  finalize(messages: Message[]): Message[] {
    for (const message of messages) {
      message.parts = message.parts.filter((part) => part.type !== 'artifact' || !this.superseded.has(part));
    }
    return messages.filter((message) => message.parts.length > 0);
  }
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', py: 'python', rb: 'ruby', rs: 'rust',
  go: 'go', java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp',
  php: 'php', sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell', sql: 'sql', html: 'html',
  css: 'css', scss: 'scss', json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
  md: 'markdown', mdx: 'mdx', svg: 'svg', vue: 'vue', svelte: 'svelte', dockerfile: 'dockerfile',
};

export function languageFromPath(path: string): string | undefined {
  const name = path.split('/').pop()?.toLowerCase() ?? '';
  if (name === 'dockerfile') return 'dockerfile';
  const extension = name.includes('.') ? name.split('.').pop() : undefined;
  return extension ? EXTENSION_LANGUAGES[extension] : undefined;
}
