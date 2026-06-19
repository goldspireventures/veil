/** Proxy join-veil → Cloudflare Pages portal (secure-text project). */
const UPSTREAM = 'https://secure-text.pages.dev';

function upstreamPath(pathname) {
  if (!pathname.endsWith('.html')) return pathname;
  const base = pathname.slice(1, -5);
  if (!base || base === 'index') return '/';
  return `/${base}`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/ops.html' || url.pathname === '/portal/ops.js') {
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }
    const target = new URL(upstreamPath(url.pathname) + url.search, UPSTREAM);
    const init = {
      method: request.method,
      headers: new Headers(request.headers),
      redirect: 'follow',
    };
    init.headers.set('Host', 'secure-text.pages.dev');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }
    const response = await fetch(target.toString(), init);
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
