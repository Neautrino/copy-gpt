import type { Conversation, SiteId } from '../conversation';

export interface ChatTarget {
  /** `unsaved`: a chat the site keeps only in the open tab (ChatGPT signed out), so the page is the only source. */
  kind: 'chat' | 'share' | 'unsaved';
  id: string;
}

export interface SiteAdapter {
  id: SiteId;
  name: string;
  /** Returns the chat shown at `url`, or null on pages that aren't a chat (home, settings…). */
  match(url: URL): ChatTarget | null;
  /** Complete conversation from the site's own API, using the user's session. */
  fetchConversation(target: ChatTarget, url: URL): Promise<Conversation>;
  /** Best-effort read of the messages currently rendered on the page. */
  readPage(target: ChatTarget, url: URL): Conversation;
}

/** Loads the chat through the API and falls back to reading the page if the API fails. */
export async function extractConversation(adapter: SiteAdapter, url: URL): Promise<Conversation> {
  const target = adapter.match(url);
  if (!target) throw new Error('Open a chat first, then copy it.');
  if (target.kind === 'unsaved') {
    const conversation = adapter.readPage(target, url);
    if (conversation.messages.length === 0) throw new Error('No messages were found on the page.');
    return conversation;
  }
  try {
    return await adapter.fetchConversation(target, url);
  } catch (apiError) {
    console.warn('[Copy Chat] API extraction failed, reading the page instead.', apiError);
    const conversation = adapter.readPage(target, url);
    if (conversation.messages.length === 0) throw apiError;
    const reason = apiError instanceof Error ? ` (${apiError.message.replace(/\.$/, '')})` : '';
    conversation.warnings.unshift(`Could not load the full chat${reason}, so this copy only has what was visible on the page.`);
    return conversation;
  }
}
