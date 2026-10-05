const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { createApp } = require('../apps/api/dist/bootstrap');
const { loadConfig } = require('../apps/api/dist/config');
const { DatabaseService } = require('../apps/api/dist/database/database.service');
const { PurgeWorker } = require('../apps/api/dist/cdn/purge-worker.service');
const { CdnService } = require('../apps/api/dist/cdn/cdn.service');
const { ScenariosService } = require('../apps/api/dist/admin/scenarios.service');

test('durable purge retry, restart recovery, and lease fencing', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'caching-outbox-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = loadConfig({ NODE_ENV: 'test', ADMIN_TOKEN: 'isolated-outbox-test-admin-token', DATA_DIR: join(directory, 'nested', 'postgres'), CDN_MODE: 'simulated', PURGE_POLL_MS: '60000' });
  let fail = true;
  let calls = 0;
  let beforeAcknowledgment;
  const purger = { enabled: true, async purge() { calls++; if (beforeAcknowledgment) await beforeAcknowledgment(); if (fail) throw new Error('Simulated purge failure'); } };
  let app = await createApp(config, purger);
  await app.init();
  let db = app.get(DatabaseService);
  const id = randomUUID();
  await db.transaction(tx => tx.query('INSERT INTO purge_jobs(id,tags) VALUES ($1,$2)', [id, ['products']]));
  await app.get(PurgeWorker).tick();
  let job = (await db.transaction(tx => tx.query('SELECT * FROM purge_jobs WHERE id=$1', [id]))).rows[0];
  assert.equal(job.status, 'pending');
  assert.equal(job.attempts, 1);
  assert.equal(job.last_error, 'Simulated purge failure');
  await app.close();

  app = await createApp(config, purger);
  t.after(() => app.close());
  await app.init();
  db = app.get(DatabaseService);
  assert.equal((await db.transaction(tx => tx.query('SELECT * FROM purge_jobs WHERE id=$1', [id]))).rows[0].attempts, 1);
  await db.transaction(tx => tx.query("UPDATE purge_jobs SET available_at=clock_timestamp()-interval '1 second' WHERE id=$1", [id]));
  fail = false;
  await app.get(PurgeWorker).tick();
  job = (await db.transaction(tx => tx.query('SELECT * FROM purge_jobs WHERE id=$1', [id]))).rows[0];
  assert.equal(job.status, 'done');
  assert.equal(job.attempts, 2);
  assert.equal(calls, 2);

  const leased = randomUUID();
  await db.transaction(tx => tx.query(`INSERT INTO purge_jobs(id,tags,status,attempts,lease_until,lease_token)
    VALUES ($1,$2,'processing',1,clock_timestamp()-interval '1 second',$3)`, [leased, ['products'], randomUUID()]));
  await app.get(PurgeWorker).tick();
  assert.equal((await db.transaction(tx => tx.query('SELECT * FROM purge_jobs WHERE id=$1', [leased]))).rows[0].status, 'done');

  const terminal = randomUUID();
  await db.transaction(tx => tx.query("INSERT INTO purge_jobs(id,tags,attempts) VALUES ($1,$2,7)", [terminal, ['products']]));
  fail = true;
  await app.get(PurgeWorker).tick();
  assert.equal((await db.transaction(tx => tx.query('SELECT * FROM purge_jobs WHERE id=$1', [terminal]))).rows[0].status, 'failed');

  const fenced = randomUUID();
  const replacementLease = randomUUID();
  await db.transaction(tx => tx.query('INSERT INTO purge_jobs(id,tags) VALUES ($1,$2)', [fenced, ['products']]));
  fail = false;
  beforeAcknowledgment = () => db.transaction(tx => tx.query('UPDATE purge_jobs SET lease_token=$2 WHERE id=$1', [fenced, replacementLease]));
  await app.get(PurgeWorker).tick();
  const fencedJob = (await db.transaction(tx => tx.query('SELECT * FROM purge_jobs WHERE id=$1', [fenced]))).rows[0];
  assert.equal(fencedJob.status, 'processing');
  assert.equal(fencedJob.lease_token, replacementLease);
});

test('Cloudflare adapter requires both an HTTP success and success=true', async () => {
  const config = loadConfig({ NODE_ENV: 'test', ADMIN_TOKEN: 'isolated-provider-test-admin-token', CDN_MODE: 'cloudflare', CLOUDFLARE_ZONE_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only-placeholder' });
  const scenarios = new ScenariosService(config);
  for (const [status, success] of [[403, false], [200, false], [500, true]]) {
    const service = new CdnService(config, scenarios, async () => Response.json({ success }, { status }));
    await assert.rejects(service.purge(['products']), /Cloudflare purge rejected/);
  }
  const service = new CdnService(config, scenarios, async (url, init) => {
    assert.match(url, /zones\/a{32}\/purge_cache$/);
    assert.deepEqual(JSON.parse(init.body), { tags: ['products'] });
    return Response.json({ success: true });
  });
  await service.purge(['products']);
});

test('production startup rejects simulated providers and failure controls', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', ADMIN_TOKEN: 'isolated-config-test-admin-token', CDN_MODE: 'simulated' }), /Production requires/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', ADMIN_TOKEN: 'isolated-config-test-admin-token', ALLOW_DEMO_FAILURES: 'true' }), /Production requires/);
});
