import { describe, expect, it } from 'vitest';
import { parseClaudeConversation, type ClaudeConversationData } from './claude';

const parse = (data: ClaudeConversationData) =>
  parseClaudeConversation(data, { id: 'conv-1', url: 'https://claude.ai/chat/conv-1' });

const text = (value: string) => ({ type: 'text', text: value });

describe('parseClaudeConversation', () => {
  it('follows the current leaf back to the root and ignores abandoned branches', () => {
    const result = parse({
      name: 'Branches',
      current_leaf_message_uuid: 'a2',
      chat_messages: [
        { uuid: 'u1', parent_message_uuid: '00000000-0000-4000-8000-000000000000', index: 0, sender: 'human', content: [text('First try')] },
        { uuid: 'a1', parent_message_uuid: 'u1', index: 1, sender: 'assistant', content: [text('Abandoned reply')] },
        { uuid: 'u2', parent_message_uuid: '00000000-0000-4000-8000-000000000000', index: 2, sender: 'human', content: [text('Edited question')] },
        { uuid: 'a2', parent_message_uuid: 'u2', index: 3, sender: 'assistant', content: [text('Kept reply')] },
      ],
    });

    expect(result.messages.map((m) => m.parts)).toEqual([[text('Edited question')], [text('Kept reply')]]);
  });

  it('falls back to index order when the current leaf is missing', () => {
    const result = parse({
      chat_messages: [
        { uuid: 'a', index: 1, sender: 'assistant', content: [text('Second')] },
        { uuid: 'u', index: 0, sender: 'human', content: [text('First')] },
      ],
    });

    expect(result.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('exports the final artifact once, keeping replacement text literal', () => {
    const artifact = (input: Record<string, unknown>) => ({ type: 'tool_use', name: 'artifacts', input: { id: 'doc', ...input } });
    const result = parse({
      current_leaf_message_uuid: 'a2',
      chat_messages: [
        { uuid: 'u1', sender: 'human', content: [text('Write a price list')] },
        {
          uuid: 'a1',
          parent_message_uuid: 'u1',
          sender: 'assistant',
          content: [artifact({ command: 'create', title: 'Prices', type: 'text/markdown', content: 'Tea: PRICE' }), text('Here it is.')],
        },
        { uuid: 'u2', parent_message_uuid: 'a1', sender: 'human', content: [text('Set the price')] },
        {
          uuid: 'a2',
          parent_message_uuid: 'u2',
          sender: 'assistant',
          content: [artifact({ command: 'update', old_str: 'PRICE', new_str: '$& $5' }), text('Updated.')],
        },
      ],
    });

    expect(result.messages[1]?.parts).toEqual([text('Here it is.')]);
    expect(result.messages[3]?.parts).toEqual([
      { type: 'artifact', title: 'Prices', language: 'markdown', content: 'Tea: $& $5' },
      text('Updated.'),
    ]);
  });

  it('keeps thinking, attachments with their text, and cited sources', () => {
    const result = parse({
      current_leaf_message_uuid: 'a',
      chat_messages: [
        {
          uuid: 'u',
          sender: 'human',
          attachments: [{ file_name: 'notes.txt', extracted_content: 'raw notes' }],
          files: [{ file_kind: 'image', file_name: 'chart.png' }],
          content: [text('Summarise')],
        },
        {
          uuid: 'a',
          parent_message_uuid: 'u',
          sender: 'assistant',
          content: [
            { type: 'thinking', thinking: 'The notes are short.' },
            { type: 'text', text: 'Summary.', citations: [{ url: 'https://example.com', title: 'Example [site]' }] },
          ],
        },
      ],
    });

    expect(result.messages[0]?.parts).toEqual([
      { type: 'attachment', name: 'notes.txt', text: 'raw notes' },
      { type: 'image', name: 'chart.png' },
      text('Summarise'),
    ]);
    expect(result.messages[1]?.parts).toEqual([
      { type: 'thinking', text: 'The notes are short.' },
      text('Summary.'),
      text('Sources:\n- [Example site](https://example.com)'),
    ]);
  });
});
