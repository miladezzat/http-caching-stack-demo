import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxy } from '../apps/web/lib/proxy';

test('proxy preserves validators, JSON type, and policy while disabling framework caching', async () => {
  const response = await proxy(new Request('http://web/api/products', { headers: { 'If-None-Match': 'W/"current"' } }), '/products', (async (url, init) => {
    assert.equal(String(url), 'http://origin/products');
    assert.equal(init?.cache, 'no-store');
    assert.equal(new Headers(init?.headers).get('if-none-match'), 'W/"current"');
    return new Response('{"data":[]}', { headers: { 'Content-Type': 'application/json', ETag: 'W/"next"', 'Cache-Control': 'public, max-age=0', 'Cloudflare-CDN-Cache-Control': 'max-age=60', 'Cache-Tag': 'products', 'Content-Encoding': 'gzip', 'Content-Length': '99' } });
  }) as typeof fetch, 'http://origin');
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(response.headers.get('etag'), 'W/"next"');
  assert.equal(response.headers.get('cloudflare-cdn-cache-control'), 'max-age=60');
  assert.equal(response.headers.get('cache-tag'), 'products');
  assert.equal(response.headers.get('content-encoding'), null);
  assert.equal(response.headers.get('content-length'), null);
  assert.deepEqual(await response.json(), { data: [] });
});
test('proxy forwards bodyless 304 and HEAD responses', async () => {
  const conditional = await proxy(new Request('http://web/api/products'), '/products', (async () => new Response(null, { status: 304, headers: { ETag: 'W/"same"' } })) as typeof fetch, 'http://origin');
  assert.equal(conditional.status, 304);
  assert.equal(await conditional.text(), '');
  const head = await proxy(new Request('http://web/api/products', { method: 'HEAD' }), '/products', (async () => new Response('must not forward')) as typeof fetch, 'http://origin');
  assert.equal(await head.text(), '');
});
test('private requests and origin failures always disable downstream caching', async () => {
  const privateResponse = await proxy(new Request('http://web/api/products', { headers: { Authorization: 'Bearer private' } }), '/products', (async () => new Response('{}', { headers: { 'Cache-Control': 'public, max-age=60', 'Cache-Tag': 'products' } })) as typeof fetch, 'http://origin');
  assert.match(privateResponse.headers.get('cache-control')!, /no-store/);
  assert.equal(privateResponse.headers.get('cache-tag'), null);
  for (const name of ['TypeError', 'TimeoutError']) {
    const response = await proxy(new Request('http://web/api/products'), '/products', (async () => { const error = new Error('failed'); error.name = name; throw error; }) as typeof fetch, 'http://origin');
    assert.equal(response.status, name === 'TimeoutError' ? 504 : 502);
    assert.match(response.headers.get('cache-control')!, /no-store/);
  }
});
