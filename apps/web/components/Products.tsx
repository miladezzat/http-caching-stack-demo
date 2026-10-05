'use client';

import { useRef, useState } from 'react';

type Product = { id: string; name: string; price: number; category: string; version: number; updatedAt: string };
type Catalog = { data: Product[]; version: number; updatedAt: string };
type Mode = 'browser' | 'validator' | 'private';
type Entry = { id: number; path: string; mode: string; status: number; duration: number; headers: Record<string, string>; reused: boolean };
type Job = { id: string; tags: string[]; status: string; attempts: number; last_error: string | null };
type Status = { cdnMode: string; databaseMode: string; failureControlsEnabled: boolean; metrics: Record<string, number>;
  scenarios: { originUnavailable: boolean; purgeUnavailable: boolean }; jobs: Job[] };
type Stored = { etag: string | null; modified: string | null; body: Catalog | Product };

export default function Products() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);
  const [history, setHistory] = useState<Entry[]>([]);
  const [mode, setMode] = useState<Mode>('browser');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Load the catalog to begin. Requests happen in your browser.');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [selected, setSelected] = useState('1');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const stored = useRef(new Map<string, Stored>());
  const sequence = useRef(0);

  async function action(run: () => Promise<void>) {
    setBusy(true); setError('');
    try { await run(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Request failed'); }
    finally { setBusy(false); }
  }

  async function read(path: string) {
    const previous = stored.current.get(path);
    const headers: Record<string, string> = {};
    if (mode === 'validator' && previous) {
      if (previous.etag) headers['If-None-Match'] = previous.etag;
      if (previous.modified) headers['If-Modified-Since'] = previous.modified;
    }
    if (mode === 'private') headers.Authorization = `Bearer ${token || 'private-request-example'}`;
    const start = performance.now();
    const response = await fetch(path, { headers, cache: mode === 'browser' ? 'default' : 'no-store' });
    const visibleHeaders: Record<string, string> = {};
    for (const key of ['etag', 'last-modified', 'cache-control', 'cloudflare-cdn-cache-control', 'cache-tag', 'cf-cache-status', 'age']) {
      const value = response.headers.get(key);
      if (value) visibleHeaders[key] = value;
    }
    const id = ++sequence.current;
    setHistory(entries => [{ id, path, mode, status: response.status,
      duration: Math.round(performance.now() - start), headers: visibleHeaders, reused: response.status === 304 }, ...entries].slice(0, 20));
    let body: Catalog | Product;
    if (response.status === 304) {
      if (!previous) throw new Error('304 received without a stored representation');
      body = previous.body;
      setNotice('304 Not Modified: retained the previously stored product data.');
    } else {
      const value = await response.json();
      if (!response.ok) throw new Error(Array.isArray(value.message) ? value.message.join(', ') : value.message || `HTTP ${response.status}`);
      body = value;
      if (mode !== 'private') stored.current.set(path, { body, etag: response.headers.get('etag'), modified: response.headers.get('last-modified') });
      setNotice(mode === 'browser' ? 'Browser-visible response loaded. DevTools shows network revalidation; the browser can merge a 304 into a usable 200.' : 'Response loaded. Repeat this request to test its validator.');
    }
    if ('data' in body) setCatalog(body); else setDetail(body);
  }

  async function admin(path: string, body?: unknown) {
    if (!token) throw new Error('Enter ADMIN_TOKEN from your root .env file');
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(', ') : result.message || `HTTP ${response.status}`);
    return result;
  }
  async function refreshStatus() { setStatus(await admin('/api/admin/status')); }
  async function save() {
    const current = catalog?.data.find(p => p.id === selected) ?? (detail?.id === selected ? detail : null);
    if (!current) throw new Error('Load the catalog or this product before editing');
    if (!token) throw new Error('Enter ADMIN_TOKEN before saving');
    if (price === '' && category === '') throw new Error('Enter a price or category change');
    const response = await fetch(`/api/products/${selected}`, { method: 'PATCH', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: current.version, ...(price !== '' ? { price: Number(price) } : {}), ...(category ? { category } : {}) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(', ') : result.message || `HTTP ${response.status}`);
    stored.current.clear();
    setCatalog(existing => existing ? { ...existing, data: existing.data.map(p => p.id === selected ? result.product : p) } : null);
    setDetail(result.product);
    setPrice(''); setCategory('');
    setNotice(`Saved revision ${result.product.version}. Invalidation job ${result.invalidation.jobId} is queued. Other clients may still see cached data until it completes.`);
    await refreshStatus();
  }

  return (
    <div className="grid">
      <section className="panel">
        <h2>Read & revalidate</h2>
        <p className="subtle">Browser mode uses the native HTTP cache. Validator mode sends conditions explicitly and keeps a copy in this page.</p>
        <label htmlFor="request-mode">Request mode</label>
        <select id="request-mode" value={mode} onChange={event => setMode(event.target.value as Mode)}>
          <option value="browser">Browser HTTP cache</option><option value="validator">Explicit validators · observe 304</option><option value="private">Private request · no-store</option>
        </select>
        <div className="controls">
          <button className="primary" disabled={busy} onClick={() => void action(() => read('/api/products'))}>Load catalog</button>
          <button disabled={busy} onClick={() => void action(() => read(`/api/products/${selected}`))}>Load product {selected}</button>
          <button disabled={busy} onClick={() => { stored.current.clear(); setNotice('Explicit validator copies cleared. The native browser cache is separate.'); }}>Clear validator copies</button>
        </div>
        <div className="notice" role="status">{notice}</div>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="products">{catalog?.data.map(p => <article className="product" key={p.id}>
          <h3>{p.name}</h3><strong>${p.price.toLocaleString()}</strong><span className="pill">{p.category} · v{p.version}</span>
        </article>)}</div>
        {detail && <details open><summary>Product {detail.id} representation</summary><pre>{JSON.stringify(detail, null, 2)}</pre></details>}
        <p className="subtle">Local mode has no edge cache. A real Cloudflare response supplies CF-Cache-Status and may remove provider-only headers.</p>
      </section>

      <section className="panel">
        <h2>Change & invalidate</h2>
        <p className="subtle">Edits use the loaded revision to prevent lost updates. The admin token stays in this tab’s memory.</p>
        <label htmlFor="admin-token">Admin token</label>
        <input id="admin-token" type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} placeholder="ADMIN_TOKEN from .env" />
        <label htmlFor="product-id">Product to edit</label>
        <select id="product-id" value={selected} onChange={event => setSelected(event.target.value)}>
          <option value="1">1 · Laptop</option><option value="2">2 · Shoes</option><option value="3">3 · Phone</option>
        </select>
        <div className="two"><div><label htmlFor="price">New price</label><input id="price" type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)} placeholder="Keep current" /></div>
          <div><label htmlFor="category">New category</label><input id="category" value={category} onChange={event => setCategory(event.target.value)} placeholder="Keep current" /></div></div>
        <div className="controls">
          <button className="primary" disabled={busy} onClick={() => void action(save)}>Save product</button>
          <button disabled={busy} onClick={() => void action(async () => { await admin('/api/admin/purge', { tags: ['products', `product:${selected}`] }); await refreshStatus(); })}>Queue purge</button>
          <button disabled={busy} onClick={() => void action(refreshStatus)}>Refresh origin status</button>
        </div>
        {status && <><span className="pill">CDN: {status.cdnMode} · {status.databaseMode}</span>
          {status.cdnMode === 'simulated' && <p className="subtle">Simulated purge acknowledgments exercise the durable worker. They do not invalidate a real edge cache.</p>}
          {status.cdnMode === 'disabled' && <p className="subtle">Purge processing is disabled. Jobs remain pending until a provider is configured.</p>}
          <div className="metrics"><div><span>Metadata reads</span><strong>{status.metrics.metadataReads}</strong></div><div><span>Body reads</span><strong>{status.metrics.bodyReads}</strong></div><div><span>Origin 304s</span><strong>{status.metrics.notModified}</strong></div></div>
          {status.failureControlsEnabled && <><h3>Controlled failures</h3><div className="controls">
            <button disabled={busy} onClick={() => void action(async () => { await admin('/api/admin/scenarios', { originUnavailable: !status.scenarios.originUnavailable }); await refreshStatus(); })}>{status.scenarios.originUnavailable ? 'Restore origin' : 'Simulate origin failure'}</button>
            <button disabled={busy} onClick={() => void action(async () => { await admin('/api/admin/scenarios', { purgeUnavailable: !status.scenarios.purgeUnavailable }); await refreshStatus(); })}>{status.scenarios.purgeUnavailable ? 'Restore purge provider' : 'Simulate purge failure'}</button>
          </div></>}
        </>}
      </section>

      <section className="panel full"><h2>Request history</h2><p className="subtle">Statuses are browser-visible. Expand a request for headers; use DevTools for native cache revalidation.</p>
        <div className="table-wrap"><table><thead><tr><th>Request</th><th>Mode</th><th>Status</th><th>Edge</th><th>Time</th><th>Headers</th></tr></thead><tbody>
          {history.map(entry => <tr key={entry.id}><td><code>{entry.path}</code></td><td>{entry.mode}</td><td><span className="pill">{entry.status}{entry.reused ? ' · reused data' : ''}</span></td><td>{entry.headers['cf-cache-status'] || 'Not observed'}{entry.headers.age ? ` · Age ${entry.headers.age}s` : ''}</td><td>{entry.duration} ms</td><td><details><summary>Inspect</summary><pre>{JSON.stringify(entry.headers, null, 2)}</pre></details></td></tr>)}
          {!history.length && <tr><td colSpan={6}>No requests yet.</td></tr>}
        </tbody></table></div>
      </section>

      {status && <section className="panel full"><h2>Durable invalidation jobs</h2><p className="subtle">Refresh origin status to observe retries. Failed jobs can be requeued after the provider recovers.</p>
        <div className="table-wrap"><table><thead><tr><th>Job</th><th>Tags</th><th>State</th><th>Attempts</th><th>Last error</th></tr></thead><tbody>
          {status.jobs.map(job => <tr key={job.id}><td><code>{job.id.slice(0, 8)}</code></td><td>{job.tags.join(', ')}</td><td>{job.status} {job.status === 'failed' && <button disabled={busy} onClick={() => void action(async () => { await admin(`/api/admin/jobs/${job.id}/retry`, {}); await refreshStatus(); })}>Retry</button>}</td><td>{job.attempts}</td><td>{job.last_error || '—'}</td></tr>)}
          {!status.jobs.length && <tr><td colSpan={5}>No jobs yet. Save a product to create one.</td></tr>}
        </tbody></table></div>
      </section>}
    </div>
  );
}
