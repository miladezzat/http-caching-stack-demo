const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../apps/api/dist/bootstrap');
const { loadConfig } = require('../apps/api/dist/config');
const { DatabaseService } = require('../apps/api/dist/database/database.service');
const { MetricsService } = require('../apps/api/dist/observability/metrics.service');
const token = 'test-admin-token-only-for-isolated-tests';

test('origin HTTP contract and transactional writes', async t => {
  const app = await createApp(loadConfig({ NODE_ENV: 'test', ADMIN_TOKEN: token, DATA_DIR: 'memory://',
    DATABASE_URL: process.env.TEST_DATABASE_URL, CDN_MODE: 'disabled', ALLOW_DEMO_FAILURES: 'true' }));
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const metrics = app.get(MetricsService);
  const db = app.get(DatabaseService);
  const get = (path, headers = {}) => fetch(base + path, { headers });
  const patch = (body, extra = {}) => fetch(base + '/products/1', { method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });

  await t.test('ETag 304 skips body loading and HEAD is bodyless', async () => {
    const first = await get('/products');
    assert.equal(first.status, 200);
    assert.match(first.headers.get('content-type'), /application\/json/);
    assert.equal(first.headers.get('cache-control'), 'public, max-age=0');
    assert.match(first.headers.get('cloudflare-cdn-cache-control'), /max-age=60/);
    const before = metrics.bodyReads;
    const repeated = await get('/products', { 'If-None-Match': first.headers.get('etag') });
    assert.equal(repeated.status, 304);
    assert.equal(await repeated.text(), '');
    assert.equal(metrics.bodyReads, before);
    const head = await fetch(base + '/products/1', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(metrics.bodyReads, before);
  });
  await t.test('ETag precedence, weak comparison, and Last-Modified round-trip', async () => {
    const first = await get('/products/1');
    const tag = first.headers.get('etag');
    const date = first.headers.get('last-modified');
    assert.equal((await get('/products/1', { 'If-None-Match': tag.replace(/^W\//, '') })).status, 304);
    assert.equal((await get('/products/1', { 'If-Modified-Since': date })).status, 304);
    assert.equal((await get('/products/1', { 'If-None-Match': '"different"', 'If-Modified-Since': new Date(Date.now() + 60000).toUTCString() })).status, 200);
  });
  await t.test('private reads and errors cannot enter shared caches', async () => {
    for (const headers of [{ Authorization: 'Bearer private' }, { Cookie: 'session=private' }]) {
      const response = await get('/products', headers);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('cloudflare-cdn-cache-control'), 'no-store');
      assert.equal(response.headers.get('cache-tag'), null);
    }
    for (const path of ['/products/missing', '/products?category=electronics']) {
      const response = await get(path);
      assert.ok(response.status >= 400);
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
    assert.equal((await get('/admin/status')).status, 401);
  });
  await t.test('writes require authorization, reject unknown fields, and enforce HTTP conditions before mutation', async () => {
    const before = await (await get('/products/1')).json();
    assert.equal((await patch({ expectedVersion: before.version, price: 2000 }, { Authorization: '' })).status, 401);
    assert.equal((await patch({ expectedVersion: before.version, id: 'changed', price: 2000 })).status, 400);
    assert.equal((await patch({ expectedVersion: before.version, price: null })).status, 400);
    assert.equal((await patch({ expectedVersion: before.version, price: 2000 }, { 'If-None-Match': '*' })).status, 412);
    assert.deepEqual(await (await get('/products/1')).json(), before);
  });
  await t.test('a committed change alters detail/list validators and atomically queues old/new category tags', async () => {
    const initialList = await get('/products');
    const first = await get('/products/1');
    const original = await first.json();
    const category = original.category === 'computers' ? 'electronics' : 'computers';
    const response = await patch({ expectedVersion: original.version, price: original.price + 1, category });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const saved = await response.json();
    assert.equal(saved.product.version, original.version + 1);
    assert.ok(saved.invalidation.tags.includes(`category:${original.category}`));
    assert.ok(saved.invalidation.tags.includes(`category:${category}`));
    const row = (await db.transaction(tx => tx.query('SELECT * FROM purge_jobs WHERE id=$1', [saved.invalidation.jobId]))).rows[0];
    assert.equal(row.status, 'pending');
    assert.deepEqual(row.tags, saved.invalidation.tags);
    assert.equal((await get('/products/1', { 'If-None-Match': first.headers.get('etag') })).status, 200);
    assert.equal((await get('/products', { 'If-None-Match': initialList.headers.get('etag') })).status, 200);
  });
  await t.test('concurrent writers with one revision cannot overwrite each other', async () => {
    const current = await (await get('/products/1')).json();
    const results = await Promise.all([patch({ expectedVersion: current.version, price: 1600 }), patch({ expectedVersion: current.version, price: 1700 })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal((await (await get('/products/1')).json()).version, current.version + 1);
  });
  await t.test('an outbox insertion failure rolls back both the product and catalog revisions', async () => {
    const original = await (await get('/products/1')).json();
    const listTag = (await get('/products')).headers.get('etag');
    await db.transaction(async tx => {
      await tx.query(`CREATE OR REPLACE FUNCTION reject_test_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$`);
      await tx.query('CREATE TRIGGER reject_job BEFORE INSERT ON purge_jobs FOR EACH ROW EXECUTE FUNCTION reject_test_job()');
    });
    try { assert.equal((await patch({ expectedVersion: original.version, price: 999 })).status, 500); }
    finally {
      await db.transaction(async tx => { await tx.query('DROP TRIGGER reject_job ON purge_jobs'); await tx.query('DROP FUNCTION reject_test_job()'); });
    }
    assert.deepEqual(await (await get('/products/1')).json(), original);
    assert.equal((await get('/products')).headers.get('etag'), listTag);
  });
  await t.test('controlled origin failure is protected and produces an uncached 503', async () => {
    const scenario = value => fetch(base + '/admin/scenarios', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ originUnavailable: value }) });
    assert.equal((await scenario(true)).status, 201);
    const response = await get('/products');
    assert.equal(response.status, 503);
    assert.match(response.headers.get('cache-control'), /no-store/);
    await scenario(false);
    assert.equal((await get('/products')).status, 200);
  });
});
