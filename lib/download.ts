import type { Conversation } from './conversation';

export function downloadFile(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** `"My chat: part 2?"` → `"My chat part 2 - ChatGPT.md"`; keeps non-Latin letters. */
export function exportFileName(conversation: Conversation, extension: string): string {
  const title = conversation.title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return `${title || 'Chat'} - ${conversation.siteName}.${extension}`;
}
