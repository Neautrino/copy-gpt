export interface ClipboardPayload {
  text: string;
  html: string;
}

/**
 * Writes Markdown (text/plain) and HTML (text/html) to the clipboard.
 *
 * Must be called synchronously from the click/keydown handler: the payload is passed as a promise so
 * `navigator.clipboard.write` starts while the user gesture is still active, even though fetching the
 * chat takes a moment. A rejected payload rejects with the payload's own error.
 */
export async function copyToClipboard(payload: Promise<ClipboardPayload>): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const item = new ClipboardItem({
        'text/plain': payload.then(({ text }) => new Blob([text], { type: 'text/plain' })),
        'text/html': payload.then(({ html }) => new Blob([html], { type: 'text/html' })),
      });
      await navigator.clipboard.write([item]);
      return;
    } catch {
      // Fall through: either the payload failed (rethrown below) or the browser refused rich writes.
    }
  }

  const { text } = await payload;
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Older Firefox and pages that lost focus: use the legacy path.
  }
  if (!legacyCopy(text)) throw new Error('The browser blocked clipboard access. Click the page and try again.');
}

function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.append(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}
