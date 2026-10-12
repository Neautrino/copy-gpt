class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(HttpError.describe(status));
    this.name = 'HttpError';
  }

  static describe(status: number): string {
    if (status === 401 || status === 403) return 'You need to be signed in with access to this chat.';
    if (status === 404) return 'This chat was not found. It may have been deleted.';
    if (status === 429) return 'Too many requests right now. Wait a minute and try again.';
    return `The site returned an error (HTTP ${status}).`;
  }
}

/**
 * Firefox runs content-script `fetch` with the extension's identity; `content.fetch` makes the request
 * as the page, with its cookies and origin. Chrome content scripts already fetch as the page.
 */
function pageFetch(): typeof fetch {
  // Firefox exposes the page window as `content` in content scripts; Chrome has no such global.
  const pageWindow: unknown = Reflect.get(globalThis, 'content');
  if (pageWindow && typeof pageWindow === 'object' && 'fetch' in pageWindow && typeof pageWindow.fetch === 'function') {
    return pageWindow.fetch.bind(pageWindow);
  }
  return fetch.bind(globalThis);
}

export async function getJson<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const url = new URL(path, location.origin).href;
  const response = await pageFetch()(url, {
    credentials: 'include',
    headers: { accept: 'application/json', ...headers },
  });
  if (!response.ok) throw new HttpError(response.status, path);
  return (await response.json()) as T;
}

export function readCookie(name: string): string | undefined {
  for (const pair of document.cookie.split('; ')) {
    const index = pair.indexOf('=');
    if (pair.slice(0, index) === name) return decodeURIComponent(pair.slice(index + 1));
  }
  return undefined;
}
