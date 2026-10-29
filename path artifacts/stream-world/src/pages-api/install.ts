/* eslint-disable @typescript-eslint/no-explicit-any */
import router from '../../../api-server/src/routes/tmdb';

// Answers the app's /api/tmdb/* calls inside the browser, using the same route code as the server.
const originalFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
  const u = new URL(raw, window.location.href);
  const i = u.pathname.indexOf('/api/');
  if (i >= 0 && method === 'GET') {
    const response = await (router as any).handle(u.pathname.slice(i + 4), u.search);
    if (response) return response;
  }
  return originalFetch(input, init);
};
