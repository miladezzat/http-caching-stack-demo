import 'dotenv/config';
import assert from 'node:assert/strict';
const base = new URL(process.env.DEMO_PUBLIC_URL ?? 'http://invalid.local');
assert.equal(base.protocol, 'https:', 'Set DEMO_PUBLIC_URL to the HTTPS Cloudflare-proxied demo');
assert.ok(process.env.ADMIN_TOKEN, 'Set ADMIN_TOKEN for this deployed demo');
const request = path => fetch(new URL(path, base), { redirect: 'error', signal: AbortSignal.timeout(10000) });
async function status() {
  const res = await fetch(new URL('/api/admin/status', base), { headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  assert.equal(res.status, 200, 'Admin status must be reachable');
  const value = await res.json();
  assert.equal(value.cdnMode, 'cloudflare', 'Live verification requires the real Cloudflare provider');
  return value;
}
const warm = await request('/api/products/1');
assert.equal(warm.status, 200);
const before = await status();
const hit = await request('/api/products/1');
assert.equal(hit.status, 200);
assert.equal(hit.headers.get('cf-cache-status'), 'HIT', 'Second request must be an edge HIT');
const age = hit.headers.get('age');
assert.ok(age !== null && /^\d+$/.test(age), 'An edge HIT must report Age');
const after = await status();
assert.equal(after.metrics.startedAt, before.metrics.startedAt, 'Origin restarted during verification');
assert.equal(after.metrics.metadataReads, before.metrics.metadataReads, 'Edge HIT unexpectedly reached the origin (use a quiet staging instance)');
assert.equal(after.metrics.bodyReads, before.metrics.bodyReads);
const privateResponse = await fetch(new URL('/api/products/1', base), { headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` }, signal: AbortSignal.timeout(10000), redirect: 'error' });
assert.match(privateResponse.headers.get('cache-control') ?? '', /no-store/);
assert.notEqual(privateResponse.headers.get('cf-cache-status'), 'HIT', 'Authenticated reads must bypass shared caching');
console.log(JSON.stringify({ edge_headers_verified: true, origin_work_verified: true,
  authenticated_bypass_verified: true, timestamp: new Date().toISOString(),
  warm: warm.headers.get('cf-cache-status'), repeat: hit.headers.get('cf-cache-status'), age: Number(age),
  mutation_and_purge: 'not exercised by this read-only check', stale_windows: 'verify with README scenarios' }, null, 2));
