const responseHeaders = ['content-type', 'etag', 'last-modified', 'cache-control',
  'cloudflare-cdn-cache-control', 'cache-tag', 'vary', 'date', 'age', 'x-content-type-options'];
const conditionalHeaders = ['if-none-match', 'if-modified-since', 'if-match', 'if-unmodified-since'];

export async function proxy(request: Request, path: string, fetcher: typeof fetch = fetch,
  origin = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000') {
  const input = new URL(request.url);
  const target = new URL(path + input.search, origin);
  if (!['http:', 'https:'].includes(target.protocol) || target.origin !== new URL(origin).origin) {
    return Response.json({ message: 'Invalid origin configuration' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  const headers = new Headers();
  for (const name of [...conditionalHeaders, 'authorization', 'cookie', 'content-type']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetcher(target, { method: request.method, headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(7000) });
    const outgoing = new Headers();
    for (const name of responseHeaders) {
      const value = upstream.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    // Node fetch may decompress; never forward upstream Content-Encoding/Length.
    // Forwarded Vary names must describe request headers this proxy actually forwards.
    const vary = outgoing.get('vary');
    if (vary) outgoing.set('vary', vary.split(',').map(v => v.trim()).filter(v => v.toLowerCase() !== 'accept-encoding').concat('Accept-Encoding').join(', '));
    if (upstream.status >= 400 || request.method === 'PATCH' || path.startsWith('/admin') || request.headers.has('authorization') || request.headers.has('cookie')) {
      outgoing.set('Cache-Control', 'private, no-store');
      outgoing.set('Cloudflare-CDN-Cache-Control', 'no-store');
      outgoing.delete('cache-tag');
    }
    const noBody = request.method === 'HEAD' || [204, 205, 304].includes(upstream.status);
    return new Response(noBody ? null : await upstream.arrayBuffer(), { status: upstream.status, headers: outgoing });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return Response.json({ message: timeout ? 'Origin timed out' : 'Origin unavailable' }, {
      status: timeout ? 504 : 502, headers: { 'Cache-Control': 'private, no-store', 'Cloudflare-CDN-Cache-Control': 'no-store' },
    });
  }
}
