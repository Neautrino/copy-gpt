import { browser } from 'wxt/browser';
import type { SiteId } from './conversation';

/** What the popup, right-click menu and keyboard shortcut can ask the chat tab to do. */
export const EXPORT_ACTIONS = ['copy', 'markdown', 'json'] as const;
export type ExportAction = (typeof EXPORT_ACTIONS)[number];

export type ContentRequest =
  | { type: 'status' }
  /** Returns the Markdown so the popup can write the clipboard itself (the page isn't focused then). */
  | { type: 'render' }
  | { type: 'run'; action: ExportAction };

export interface PageStatus {
  site: SiteId;
  siteName: string;
  onChat: boolean;
}

export interface ExportSuccess {
  ok: true;
  messageCount: number;
  warnings: string[];
}

export interface ExportFailure {
  ok: false;
  error: string;
}

export type ExportOutcome = ExportSuccess | ExportFailure;
export type RenderOutcome = (ExportSuccess & { markdown: string; html: string }) | ExportFailure;

// Responses cross the extension messaging boundary; the content script is the only responder.
export async function requestStatus(tabId: number): Promise<PageStatus> {
  const status: PageStatus = await browser.tabs.sendMessage(tabId, { type: 'status' } satisfies ContentRequest);
  return status;
}

export async function requestRender(tabId: number): Promise<RenderOutcome> {
  const outcome: RenderOutcome = await browser.tabs.sendMessage(tabId, { type: 'render' } satisfies ContentRequest);
  return outcome;
}

export async function requestRun(tabId: number, action: ExportAction): Promise<ExportOutcome> {
  const outcome: ExportOutcome = await browser.tabs.sendMessage(tabId, { type: 'run', action } satisfies ContentRequest);
  return outcome;
}

export function isContentRequest(message: unknown): message is ContentRequest {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  if (message.type === 'status' || message.type === 'render') return true;
  return message.type === 'run' && 'action' in message && EXPORT_ACTIONS.some((action) => action === message.action);
}

export const SUPPORTED_SITES_HINT = 'Open a ChatGPT or Claude chat to copy it.';
