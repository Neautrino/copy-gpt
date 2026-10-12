import { marked } from 'marked';
import type { Conversation, Part } from './conversation';
import type { ExportOptions } from './options';

/** Wraps `content` in a code fence longer than any backtick run inside it. */
export function fence(content: string, language = ''): string {
  let longest = 0;
  for (const match of content.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const ticks = '`'.repeat(Math.max(3, longest + 1));
  return `${ticks}${language}\n${content.replace(/\n+$/, '')}\n${ticks}`;
}

function details(summary: string, body: string): string {
  const escaped = summary.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<details>\n<summary>${escaped}</summary>\n\n${body}\n\n</details>`;
}

function renderPart(part: Part, options: ExportOptions): string | null {
  switch (part.type) {
    case 'text':
      return part.text.trim() || null;
    case 'thinking':
      return options.includeThinking && part.text.trim() ? details('Thinking', part.text.trim()) : null;
    case 'tool_call':
      return options.includeToolCalls ? details(`Tool call: ${part.name}`, fence(part.input, part.language)) : null;
    case 'tool_result': {
      if (!options.includeToolCalls || !part.text.trim()) return null;
      const label = `Tool result${part.name ? `: ${part.name}` : ''}${part.isError ? ' (error)' : ''}`;
      return details(label, fence(part.text));
    }
    case 'artifact':
      return `**${part.title}**\n\n${fence(part.content, part.language)}`;
    case 'attachment':
      return options.includeAttachments && part.text?.trim()
        ? details(`Attachment: ${part.name}`, fence(part.text))
        : `*Attachment: ${part.name}*`;
    case 'image':
      return `*[Image${part.name ? `: ${part.name}` : ''}]*`;
  }
}

export interface RenderResult {
  markdown: string;
  /** Messages that produced visible output with the chosen options. */
  messageCount: number;
}

export function renderMarkdown(conversation: Conversation, options: ExportOptions): RenderResult {
  const blocks: string[] = [`# ${conversation.title.replace(/\s+/g, ' ').trim() || 'Untitled chat'}`];

  if (options.includeMetadata) {
    const date = new Date().toISOString().slice(0, 10);
    blocks.push(`*${conversation.siteName} · exported ${date} · [open chat](${conversation.url})*`);
  }
  for (const warning of conversation.warnings) blocks.push(`> **Note:** ${warning}`);

  let messageCount = 0;
  for (const message of conversation.messages) {
    const body = message.parts
      .map((part) => renderPart(part, options))
      .filter((block): block is string => block !== null);
    if (body.length === 0) continue;
    messageCount++;
    blocks.push(`## ${message.role === 'user' ? 'User' : conversation.siteName}`, ...body);
  }

  return { markdown: `${blocks.join('\n\n')}\n`, messageCount };
}

/** HTML flavour for the clipboard, so pasting into rich editors keeps headings, lists and code. */
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false, gfm: true });
}
