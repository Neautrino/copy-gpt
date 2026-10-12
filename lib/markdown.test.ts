import { describe, expect, it } from 'vitest';
import type { Conversation } from './conversation';
import { fence, renderMarkdown } from './markdown';
import { DEFAULT_OPTIONS } from './options';

const chat = (overrides: Partial<Conversation> = {}): Conversation => ({
  site: 'claude',
  siteName: 'Claude',
  id: 'c1',
  title: 'Sorting\nhelp',
  url: 'https://claude.ai/chat/c1',
  source: 'api',
  warnings: [],
  messages: [
    { id: 'u', role: 'user', parts: [{ type: 'text', text: 'Sort this' }] },
    {
      id: 'a',
      role: 'assistant',
      parts: [
        { type: 'thinking', text: 'Use sorted().' },
        { type: 'tool_call', name: 'python', input: 'print(sorted([2, 1]))', language: 'python' },
        { type: 'tool_result', name: 'python', text: '[1, 2]' },
        { type: 'text', text: 'Done: `[1, 2]`.' },
      ],
    },
    { id: 'a2', role: 'assistant', parts: [{ type: 'thinking', text: 'Only thoughts here.' }] },
  ],
  ...overrides,
});

describe('fence', () => {
  it('uses a fence longer than any backtick run in the content', () => {
    expect(fence('```js\nx\n```', 'md')).toBe('````md\n```js\nx\n```\n````');
    expect(fence('plain')).toBe('```\nplain\n```');
  });
});

describe('renderMarkdown', () => {
  it('leaves out thinking and tool calls by default and skips turns left empty', () => {
    const { markdown, messageCount } = renderMarkdown(chat(), { ...DEFAULT_OPTIONS, includeMetadata: false });

    expect(markdown).toBe('# Sorting help\n\n## User\n\nSort this\n\n## Claude\n\nDone: `[1, 2]`.\n');
    expect(messageCount).toBe(2);
  });

  it('includes thinking and tool calls as collapsed blocks when enabled', () => {
    const { markdown, messageCount } = renderMarkdown(chat(), {
      ...DEFAULT_OPTIONS,
      includeMetadata: false,
      includeThinking: true,
      includeToolCalls: true,
    });

    expect(markdown).toContain('<details>\n<summary>Thinking</summary>\n\nUse sorted().\n\n</details>');
    expect(markdown).toContain('<summary>Tool call: python</summary>\n\n```python\nprint(sorted([2, 1]))\n```');
    expect(markdown).toContain('<summary>Tool result: python</summary>\n\n```\n[1, 2]\n```');
    expect(messageCount).toBe(3);
  });

  it('puts warnings at the top so a partial copy is never silent', () => {
    const { markdown } = renderMarkdown(chat({ warnings: ['3 of 9 messages are missing.'] }), DEFAULT_OPTIONS);

    expect(markdown).toMatch(/^# Sorting help\n\n\*Claude · exported \d{4}-\d{2}-\d{2} · \[open chat\]\(https:\/\/claude\.ai\/chat\/c1\)\*\n\n> \*\*Note:\*\* 3 of 9 messages are missing\./);
  });
});
