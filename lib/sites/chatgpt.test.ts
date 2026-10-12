import { describe, expect, it } from 'vitest';
import { parseChatGPTConversation, type ChatGPTConversationData } from './chatgpt';

type MessageInput = {
  role: string;
  text?: string;
  contentType?: string;
  recipient?: string;
  authorName?: string;
  metadata?: Record<string, unknown>;
};

/** Builds a `mapping` where each entry's parent is given explicitly, like the real API. */
function conversation(nodes: [id: string, parent: string | null, message?: MessageInput][], currentNode: string): ChatGPTConversationData {
  const mapping: ChatGPTConversationData['mapping'] = {};
  for (const [id, parent, input] of nodes) {
    mapping[id] = {
      id,
      parent,
      children: [],
      message: input && {
        id,
        author: { role: input.role, name: input.authorName ?? null },
        recipient: input.recipient ?? 'all',
        content: input.contentType === 'code'
          ? { content_type: 'code', text: input.text ?? '', language: 'unknown' }
          : { content_type: input.contentType ?? 'text', parts: [input.text ?? ''] },
        metadata: input.metadata,
      },
    };
  }
  for (const [id, parent] of nodes) if (parent) mapping[parent]!.children!.push(id);
  return { title: 'Test chat', current_node: currentNode, mapping };
}

const parse = (data: ChatGPTConversationData) =>
  parseChatGPTConversation(data, { id: 'chat-1', url: 'https://chatgpt.com/c/chat-1' });

describe('parseChatGPTConversation', () => {
  it('exports the branch on screen and skips hidden, system and memory messages', () => {
    const result = parse(
      conversation(
        [
          ['root', null],
          ['system', 'root', { role: 'system', text: '', metadata: { is_visually_hidden_from_conversation: true } }],
          ['question', 'system', { role: 'user', text: 'What is 2+2?' }],
          ['memory', 'question', { role: 'assistant', contentType: 'model_editable_context', text: 'remembers things' }],
          ['old-answer', 'memory', { role: 'assistant', text: 'Five' }],
          ['new-answer', 'memory', { role: 'assistant', text: 'Four', metadata: { model_slug: 'gpt-5' } }],
        ],
        'new-answer',
      ),
    );

    expect(result.messages.map((m) => [m.role, m.parts])).toEqual([
      ['user', [{ type: 'text', text: 'What is 2+2?' }]],
      ['assistant', [{ type: 'text', text: 'Four' }]],
    ]);
    expect(result.messages[1]?.model).toBe('gpt-5');
  });

  it('folds tool calls and their results into the assistant turn that used them', () => {
    const result = parse(
      conversation(
        [
          ['root', null],
          ['question', 'root', { role: 'user', text: 'Weather?' }],
          ['search', 'question', { role: 'assistant', contentType: 'code', recipient: 'web', text: '{"q":"weather"}' }],
          ['results', 'search', { role: 'tool', authorName: 'web', text: 'Sunny, 21°C' }],
          ['answer', 'results', { role: 'assistant', text: 'It is sunny.' }],
        ],
        'answer',
      ),
    );

    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]?.parts).toEqual([
      { type: 'tool_call', name: 'web', input: '{"q":"weather"}', language: 'json' },
      { type: 'tool_result', name: 'web', text: 'Sunny, 21°C' },
      { type: 'text', text: 'It is sunny.' },
    ]);
  });

  it('turns citation markers into links and drops markers without a source', () => {
    const cited = '\uE200cite\uE202turn0search1\uE201';
    const result = parse(
      conversation(
        [
          ['root', null],
          ['question', 'root', { role: 'user', text: 'Capital of France?' }],
          [
            'answer',
            'question',
            {
              role: 'assistant',
              text: `Paris ${cited}. Also \uE200cite\uE202turn0search9\uE201 legacy【3†source】.`,
              metadata: { content_references: [{ matched_text: cited, alt: '([Wikipedia](https://en.wikipedia.org/wiki/Paris))' }] },
            },
          ],
        ],
        'answer',
      ),
    );

    expect(result.messages[1]?.parts).toEqual([
      { type: 'text', text: 'Paris ([Wikipedia](https://en.wikipedia.org/wiki/Paris)). Also  legacy.' },
    ]);
  });

  it('exports only the final canvas, at the point of its last edit', () => {
    const create = JSON.stringify({ name: 'Essay', type: 'document', content: 'Hello world. Hello again.' });
    const update = JSON.stringify({ updates: [{ pattern: 'Hello', multiple: true, replacement: 'Greetings' }] });
    const result = parse(
      conversation(
        [
          ['root', null],
          ['ask', 'root', { role: 'user', text: 'Write an essay' }],
          ['create', 'ask', { role: 'assistant', contentType: 'code', recipient: 'canmore.create_textdoc', text: create }],
          ['created', 'create', { role: 'tool', authorName: 'canmore.create_textdoc', text: 'ok' }],
          ['ask-2', 'created', { role: 'user', text: 'More formal' }],
          ['update', 'ask-2', { role: 'assistant', contentType: 'code', recipient: 'canmore.update_textdoc', text: update }],
          ['done', 'update', { role: 'assistant', text: 'Updated.' }],
        ],
        'done',
      ),
    );

    expect(result.messages.map((m) => m.role)).toEqual(['user', 'user', 'assistant']);
    expect(result.messages[2]?.parts).toEqual([
      { type: 'artifact', title: 'Essay', language: 'markdown', content: 'Greetings world. Greetings again.' },
      { type: 'text', text: 'Updated.' },
    ]);
  });
});
