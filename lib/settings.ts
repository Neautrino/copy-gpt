import { storage } from 'wxt/utils/storage';
import { DEFAULT_OPTIONS, type ExportOptions } from './options';

/** Synced across the user's browsers; read by both the page button and the popup. */
export const settingsItem = storage.defineItem<Partial<ExportOptions>>('sync:exportOptions', {
  fallback: {},
});

export async function getSettings(): Promise<ExportOptions> {
  return { ...DEFAULT_OPTIONS, ...(await settingsItem.getValue()) };
}

export async function setSetting(key: keyof ExportOptions, value: boolean): Promise<void> {
  await settingsItem.setValue({ ...(await settingsItem.getValue()), [key]: value });
}

export function watchSettings(callback: (options: ExportOptions) => void): () => void {
  return settingsItem.watch((value) => callback({ ...DEFAULT_OPTIONS, ...value }));
}
