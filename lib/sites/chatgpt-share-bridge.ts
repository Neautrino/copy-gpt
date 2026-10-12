/**
 * ChatGPT share pages embed the whole conversation in `window.__reactRouterContext`, which only
 * page (MAIN world) scripts can read. The MAIN-world script answers a request event with the data as
 * a JSON string; strings cross the world boundary safely in both Chrome and Firefox.
 */
const REQUEST_EVENT = 'copy-chat:share-data-request';
const RESPONSE_EVENT = 'copy-chat:share-data-response';

/** Runs in the MAIN world. `initialPath` guards against stale data after client-side navigation. */
export function serveShareData(initialPath: string): void {
  document.addEventListener(REQUEST_EVENT, () => {
    let data: unknown = null;
    if (location.pathname === initialPath) {
      const context: unknown = Reflect.get(window, '__reactRouterContext');
      const loaderData: unknown =
        context && typeof context === 'object' && 'state' in context && context.state && typeof context.state === 'object' && 'loaderData' in context.state
          ? context.state.loaderData
          : undefined;
      if (loaderData && typeof loaderData === 'object') {
        for (const [route, value] of Object.entries(loaderData)) {
          if (!route.startsWith('routes/share.') || !value || typeof value !== 'object' || !('serverResponse' in value)) continue;
          const response = value.serverResponse;
          if (response && typeof response === 'object' && 'type' in response && response.type === 'data' && 'data' in response) {
            data = response.data;
          }
        }
      }
    }
    document.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: JSON.stringify(data) }));
  });
}

/** Runs in the content script. Resolves to null when the page has no embedded share data. */
export function requestShareData(): Promise<unknown> {
  const { promise, resolve } = Promise.withResolvers<unknown>();
  const finish = (value: unknown) => {
    clearTimeout(timer);
    document.removeEventListener(RESPONSE_EVENT, onResponse);
    resolve(value);
  };
  const onResponse = (event: Event) => {
    const detail: unknown = event instanceof CustomEvent ? event.detail : null;
    finish(typeof detail === 'string' ? JSON.parse(detail) : null);
  };
  // Only share pages run the page-world script; elsewhere nobody answers.
  const timer = setTimeout(() => finish(null), 1000);
  document.addEventListener(RESPONSE_EVENT, onResponse);
  document.dispatchEvent(new CustomEvent(REQUEST_EVENT));
  return promise;
}
