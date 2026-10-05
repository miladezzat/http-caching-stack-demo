# The HTTP Caching Laboratory

A production-oriented reference demo for **NestJS + Next.js + PostgreSQL + Cloudflare**. Inspect browser requests, send conditional reads, edit products safely, and observe durable CDN invalidation. It is a reference implementation with explicit consistency limits; deploying it still requires your own authentication, infrastructure, and operational setup.

## Start locally

Use **Node.js 24** and npm. Docker is optional.

```bash
nvm use
npm ci
npm run dev
```

Open **http://localhost:4000**. The origin listens on **127.0.0.1:3000**. The first startup creates a root `.env` with a random `ADMIN_TOKEN`. Enter that token into the laboratory's admin form to edit products, inspect jobs, or exercise failure controls. The token remains in tab memory; it is not embedded in the client bundle or saved to browser storage.

The default local database is [PGlite](https://pglite.dev/docs/api), embedded PostgreSQL persisted under `.data/postgres`. One API process owns that directory. For multiple API instances, use external PostgreSQL:

```bash
docker compose up -d postgres
```

Set `DATABASE_URL=postgresql://demo:demo@127.0.0.1:5432/caching_demo` in the root `.env`, then restart the API. Embedded and external databases are separate stores; changing the adapter does not migrate existing data. Demo credentials in `compose.yaml` are for local development.

## Architecture and ownership

```mermaid
flowchart LR
    Browser[Browser HTTP cache] --> CF[Cloudflare edge cache]
    CF -->|MISS or write bypass| Next[Next.js API proxy]
    Next --> Nest[NestJS origin]
    Nest --> DB[(PostgreSQL)]
    DB -->|Committed outbox jobs| Worker[Purge worker]
    Worker -->|Purge resource tags| CF
```

Cloudflare is optional locally. Without it, browser requests go directly to Next.js.

| Component | Owns | Does not own |
| --- | --- | --- |
| Browser | HTTP response storage and validation; separate manual copies in validator mode | Shared application data |
| Cloudflare | Public product responses, edge freshness, stale windows, tag invalidation | Product persistence or write authorization |
| Next.js | Static page shell and explicit API forwarding | A second product Data Cache or ISR product snapshot |
| NestJS | Representations, validators, policy, validation, write preconditions | Fake edge HITs |
| PostgreSQL | Products, revisions, catalog revision, transactional outbox | HTTP response caching |
| Purge worker | Durable retries and provider acknowledgment | Guaranteed immediate global consistency |

The proxy fetches the private origin with `cache: 'no-store'`, preserving HTTP response policies for the outer browser/CDN. This disables **Next.js server data caching**, not Cloudflare's cache. Keep the origin outside a second CDN path to avoid independent cache layers and lost `Cache-Tag` headers. [Next.js fetch semantics](https://nextjs.org/docs/app/api-reference/functions/fetch)

## Caching types: the complete stack catalog

“Caching” describes several independent mechanisms. **Location**, **scope**, **freshness**, **population strategy**, and **invalidation** are different dimensions. A Redis cache-aside store and a browser conditional HTTP cache are not interchangeable.

### Browser and frontend caches

| Type | What it stores / lifetime | Use and tradeoff | In this demo |
| --- | --- | --- | --- |
| Browser HTTP memory cache | Responses, often within a browsing session | Fast retrieval; browser controls storage and eviction | Native browser mode |
| Browser HTTP disk cache | Responses that can survive navigation/restart | Honors HTTP policy; may be evicted early | Browser-managed; storage location is not guaranteed |
| Private HTTP cache | Responses owned by one user agent | Can store personal responses when allowed; `private` excludes shared caches | Private requests deliberately use `no-store` |
| Client application/query cache | Parsed objects keyed by query/resource | SWR/TanStack Query can deduplicate, refetch, and update UI; separate from HTTP storage | Manual validator copies only; no query library |
| Component memoization | Computation results or stable identities | `useMemo`/`useCallback` reduce repeated component work; correctness must not depend on retention | Explained, not added |
| Service worker / Cache API | Explicitly stored Request/Response pairs | Offline-first control; application must implement expiry and invalidation | Not installed |
| Next.js Router Cache | Client navigation/RSC state | Speeds navigation; clearing it does not purge a CDN | Framework-managed navigation, not product storage |
| Back/forward cache (bfcache) | A paused document and its execution state | Restores a page on history navigation; eligibility differs from HTTP caching | Browser-managed, not a data freshness guarantee |
| Persistent client storage | IndexedDB/localStorage application records | Persistence alone supplies no freshness rules | Not used for products or credentials |

The [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) is explicitly managed storage, not an automatic substitute for the browser HTTP cache.

### HTTP intermediaries and edge caches

| Type | What it stores | Use and tradeoff | In this demo |
| --- | --- | --- | --- |
| Shared HTTP proxy cache | HTTP responses shared by multiple clients | Needs correct scope and representation keys | Cloudflare when configured |
| Reverse proxy cache | Responses near an origin, e.g. NGINX/Varnish | Can reduce application traffic; adds another invalidation boundary | No extra reverse-proxy cache |
| CDN / edge cache | Responses near users | Avoids proxy/origin work on a HIT; provider rules determine eligibility | Real Cloudflare mode |
| Tiered CDN / origin shield | Responses at additional intermediary tiers | Reduces repeated origin fills across edge locations | Optional Cloudflare deployment setting |
| Full-response/page cache | Complete HTML or JSON responses | Cheap reads; every representation dimension must affect the key | Product JSON at the edge; page shell separately |
| Fragment cache | Reusable page/component fragments | Useful when public and dynamic content coexist | Comparison only |
| Static asset cache | Versioned JS/CSS/images | Long TTL plus content-derived filenames avoids broad purges | Next.js generated assets |
| Negative cache | Selected misses/errors, e.g. a brief 404 | Reduces repeated invalid requests but can hide newly created resources | Errors are explicitly `no-store` |

Cloudflare does not cache extensionless JSON endpoints by default; the deployed demo needs explicit eligibility rules. [Default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)

### Next.js and React server caches

| Type | Lifetime and purpose | In this demo |
| --- | --- | --- |
| Request memoization / React `cache()` | Deduplicates compatible work within a server render/request; not a persistent shared cache | No product server render; comparison only |
| Next.js Data Cache | Persists opted-in server fetch results across requests according to the framework configuration | Disabled for origin API fetches |
| Full Route Cache | Stores eligible prerendered HTML/RSC output | Static laboratory shell only |
| Static generation (SSG) | Produces reusable output ahead of requests | Laboratory shell is prerendered at build time |
| Incremental Static Regeneration (ISR) | Replaces cached route output periodically/on demand | No product ISR snapshot |
| Cache Components / `use cache` | Opt-in caching for functions, components, or routes using cache lifetime and tags | Explained; Cache Components are not enabled |
| On-demand framework revalidation | `revalidatePath`, `revalidateTag`, `updateTag` invalidate framework-owned entries | Not needed for product data; these do not purge Cloudflare |
| Build/compiler cache | Compiled modules/build artifacts | Next.js/npm/CI may reuse tooling work; unrelated to runtime product freshness |

This repository uses Next.js 16 with its standard route model. Configuration and caching defaults are version-dependent. Use the matching [Next.js caching guide](https://nextjs.org/docs/app/getting-started/caching) and [previous model guide](https://nextjs.org/docs/app/guides/caching-without-cache-components). React describes request-scoped [server memoization](https://react.dev/reference/react/cache) separately.

### Application, database, and infrastructure caches

| Type | Purpose and tradeoff | In this demo |
| --- | --- | --- |
| Process-local memory/LRU cache | Cheap objects/computations within one process; capacity and eviction required; replicas diverge | No origin product object cache |
| Distributed cache (Redis/Memcached) | Shares cached objects across processes; network cost and invalidation remain | Not required |
| Database/query result cache | Reuses result sets keyed by query and relevant context | No application-level query cache |
| Database buffer/page cache | Engine-managed reuse of database pages | PostgreSQL-managed; HTTP TTLs do not control it |
| Materialized view / read model | Persisted derived data with an explicit refresh model | Catalog revision is metadata, not a materialized product cache |
| ORM identity map | Reuses entities inside a unit of work/session | No ORM |
| Filesystem/OS page cache | Reuses file pages below the application | OS-managed |
| CPU instruction/data caches | Reuse machine instructions and memory lines | Hardware-managed; outside application freshness policy |
| DNS cache | Reuses name-resolution records according to DNS TTLs | Infrastructure-managed; independent of HTTP response TTLs |
| TLS session resumption | Reuses cryptographic session state | Transport optimization, not product response storage |
| Connection pooling / keep-alive | Reuses connections | Resource reuse rather than a data cache; the external PostgreSQL adapter uses a pool |

These mechanisms can improve latency without changing the HTTP cache contract. Measure the layer you intend to optimize: an origin 304 still performs a metadata query, while an edge HIT avoids the origin entirely.

## Cache population and write strategies

These strategies apply mainly to application/object caches, and can be combined with the layers above.

| Strategy | Flow | Main tradeoff | Demo relationship |
| --- | --- | --- | --- |
| Cache-aside / lazy loading | Read cache; on miss, load source and populate | Easy adoption; concurrent fills and stale entries need handling | Comparable to demand-filled HTTP caching, without adding Redis |
| Read-through | Cache abstraction loads the source on a miss | Centralized loading; tighter coupling to cache implementation | CDN automatically fills from upstream |
| Write-through | Write source and cache through one abstraction | Fresh reads; cross-system atomicity is still a separate problem | Not claimed |
| Write-behind / write-back | Acknowledge cache write; persist source later | Lower write latency; durability/order/recovery become critical | Not used; database commit precedes acknowledgment |
| Write-around | Write source while allowing later reads to fill cache | Less cache pollution; existing entries must be invalidated | Source write plus invalidation |
| Refresh-ahead / prewarming | Refresh/populate before demand or expiry | Fewer cold misses; potentially wasted work | Not scheduled |
| Stale-while-revalidate | Serve an allowed stale response while refreshing | Better availability/latency with explicit staleness | Configured for Cloudflare; verify live |
| Stale-if-error | Serve an allowed stale response during qualifying upstream errors | Availability versus freshness; must be bounded | Configured for Cloudflare; verify live |
| Request coalescing / single-flight | Share one in-flight fill among simultaneous readers | Reduces stampedes; lock ownership/timeouts matter | No custom distributed fill lock |
| TTL jitter | Randomize expiry around a target | Spreads refresh load; complicates exact timing | Purge retry delay has jitter; response TTLs are fixed |

An eviction algorithm (LRU/LFU/FIFO/random), cache size limit, TTL, and invalidation event solve different problems. **Eviction is capacity management; expiration is freshness management.** An entry may be evicted before its TTL expires.

## HTTP freshness, validation, and headers

A cache stores a response and its metadata. A **fresh** stored response may be reused; an expired response requires validation or an explicitly allowed stale policy. A **304** has no new representation body: the recipient keeps its existing body and updates metadata. [HTTP caching specification](https://www.rfc-editor.org/rfc/rfc9111.html)

| Header / directive | Meaning | Demo policy |
| --- | --- | --- |
| `public` | Permits shared caching subject to other rules | Anonymous product reads |
| `private` | Restricts storage to private caches | Used with `no-store` for private/control responses |
| `no-store` | Do not store this response | Writes, admin, private requests, errors |
| `no-cache` | Storage is allowed, but reuse requires successful validation | Explained; not used for the Cloudflare policy |
| `max-age=N` | Freshness lifetime relative to response age | Browser `max-age=0`; separate edge max-age |
| `s-maxage=N` | Shared-cache freshness override with additional revalidation semantics | Deliberately not combined with edge stale serving |
| `must-revalidate` / `proxy-revalidate` | Restrict stale reuse in private/shared caches | Explained; not combined with the stale policy |
| `stale-while-revalidate=N` | Allows bounded stale serving during refresh | List 30s; detail 60s at Cloudflare |
| `stale-if-error=N` | Allows bounded stale reuse for eligible upstream errors | 60s at Cloudflare |
| `immutable` | Indicates an unchanged resource during its fresh lifetime | Appropriate for versioned static assets |
| `ETag` | Representation validator; `W/` denotes weak equivalence | Hash of representation schema, resource identity, and committed revision |
| `Last-Modified` | Last modification time, at HTTP second precision | Persisted resource/catalog modification time |
| `If-None-Match` | Conditional retrieval, or nonexistence/mismatch precondition on writes | Weak comparison; takes precedence over modification date |
| `If-Modified-Since` | Date-based GET/HEAD validation | Ignored when If-None-Match is present |
| `If-Match` | Strong entity-tag write/read precondition | Wildcard supported; weak read tags cannot satisfy strong comparison |
| `If-Unmodified-Since` | Date precondition when If-Match is absent | Evaluated before writes |
| `Vary` | Names representation-selecting request headers | `Accept-Encoding`; authenticated/cookie requests bypass storage |
| `Date` / `Age` | Response generation time / estimated cache age | Preserve Date; inspect Age at Cloudflare |
| `Expires` | Absolute expiry, superseded by applicable Cache-Control | Not needed |
| `Cache-Tag` | Provider resource-group invalidation metadata | `products`, `product:<id>`, category tags on details |
| `Cloudflare-CDN-Cache-Control` | Cloudflare-specific policy, separate from browser policy | Controls edge TTL and stale windows |

See the [header reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) and [HTTP conditional-request semantics](https://www.rfc-editor.org/rfc/rfc9110.html#section-13). Cache policy is explicit here; heuristic freshness based on dates or default status-code behavior is not relied upon.

### Policies used by this demo

| Endpoint/response | Browser Cache-Control | Cloudflare policy |
| --- | --- | --- |
| Anonymous `GET/HEAD /api/products` | `public, max-age=0` | `public, max-age=60, stale-while-revalidate=30, stale-if-error=60` |
| Anonymous `GET/HEAD /api/products/:id` | `public, max-age=0` | `public, max-age=300, stale-while-revalidate=60, stale-if-error=60` |
| Authenticated/cookie read, PATCH, admin, error | `private, no-store` | `no-store` and deployment bypass rules |

Browser max-age=0 allows storage, but makes the response immediately require freshness validation. It is different from no-store. `LIST_EDGE_TTL` and `DETAIL_EDGE_TTL` are configurable; stale windows remain 30/60s and error tolerance remains 60s.

Cloudflare evaluates its provider-specific header separately. Current Cloudflare documentation says applicable `s-maxage`, `must-revalidate`, `proxy-revalidate`, and `no-cache` can prohibit stale serving under Origin Cache Control. This is why the demo uses provider `max-age`, and does not assume that the old `s-maxage + stale-while-revalidate` combination behaves as intended. [Provider header precedence](https://developers.cloudflare.com/cache/concepts/cdn-cache-control/), [revalidation](https://developers.cloudflare.com/cache/concepts/revalidation/), [origin directives](https://developers.cloudflare.com/cache/concepts/cache-control/)

### Cache keys and variants

The public response identity includes the hostname, path/product ID, representation schema, and supported encoding behavior. Product routes reject query parameters rather than silently omitting a filter from the cache identity. There is no locale, tenant, pagination, or authorization-dependent public variant.

If those features are added, update both the representation and provider cache-key configuration. Preserve meaningful query values. Do not use an unbounded user-controlled header as a cache key. `Vary` alone must not be assumed sufficient for every provider; check [Cloudflare Vary configuration](https://developers.cloudflare.com/cache/concepts/vary/). Requests carrying Authorization or Cookie are bypassed at both the application and edge rules.

## Consistency and invalidation

Reads inspect cheap revision metadata before loading product bodies. Validators and bodies come from one repeatable-read database snapshot. Matching reads return bodyless 304s without loading the full representation. This saves body work and bandwidth; it does not eliminate the metadata query.

Writes require authorization and a JSON `expectedVersion`. The product row is locked, HTTP preconditions are evaluated, and revision conflicts return **409**. Failed HTTP preconditions return **412** before mutation. The weak read ETag is not a strong write lock; use expectedVersion for optimistic concurrency.

The transaction updates the product, advances the catalog revision, and inserts a purge job. All three commit or roll back together. The HTTP write response contains the committed product and a **pending** job; it never reports an unconfirmed purge as complete.

| Invalidation type | What changes | Demo use |
| --- | --- | --- |
| TTL expiry | Entry becomes stale; it may remain stored | Safety fallback with explicit stale windows |
| Conditional revalidation | Validate a stored representation | ETag first, date fallback |
| Purge by URL | Remove one response/cache identity | Comparison only; deployment-specific variants need care |
| Purge by tag / surrogate key | Remove a resource group | Implemented through Cloudflare Cache-Tag |
| Purge by prefix/hostname/all | Remove a broad group | Explained; broad emergency operations are not the normal write path |
| Versioned URL/key | New identity points to new content | Appropriate for fingerprinted static assets |
| Framework path/tag invalidation | Invalidate Next.js-owned entries | Separate from Cloudflare; not used for products |
| Event/outbox invalidation | Persist intent with the source write, deliver later | Implemented durable purge jobs |
| Soft invalidation | Mark stale while allowing policy-controlled reuse | Conceptually different from removing an entry |
| Hard invalidation | Remove the entry, forcing a future fill | Tag purge targets the CDN entries |

Product updates queue `product:<id>`, `products`, and **both old and new category tags**. Product detail responses carry resource/category tags; the list carries `products`. Collection and resource tags are intentionally different so invalidation does not depend on tags assembled from an expensive full list read.

The worker claims jobs using row locks and a 30-second lease. Provider requests time out after 5 seconds. Retries use exponential delay capped at 60 seconds plus jitter; an eighth failed attempt parks the job as `failed`. An authenticated retry operation requeues failed jobs. Expired processing leases are recoverable after a crash. Lease tokens fence stale job completions. Delivery is **at least once**; repeated purges are expected.

**Freshness guarantee:** the writer receives its committed product immediately. Other clients may see an older edge response until invalidation succeeds or freshness/stale allowances are exhausted. Purges can race an already in-flight fill, so this is eventual consistency, not an immediate global read-after-write guarantee. An accepted purge also does not erase previously stored browser/application copies. Browser responses require revalidation here, and the editing tab clears its manual validator copies after a write.

Catalog prices are illustrative cached data. A real checkout/payment decision must read authoritative transactional data through an uncached operation.

## Laboratory modes and reproducible scenarios

| CDN mode | What actually happens |
| --- | --- |
| `simulated` | Local worker acknowledges simulated purges; no edge entries exist or get purged |
| `disabled` | Jobs stay pending; no provider request is made |
| `cloudflare` | Worker calls the Cloudflare API and checks HTTP status plus `success: true` |

`ALLOW_DEMO_FAILURES=true` enables authenticated origin/purge failure controls. Production configuration rejects these controls and simulated CDN mode. Failure switches and metrics are process-local and reset after restart; products and jobs persist. In a multi-instance deployment, local counters must be replaced/aggregated by real telemetry before using them as global evidence.

### Browser workflow

1. Choose **Browser HTTP cache**, then Load catalog twice. Inspect DevTools with its “Disable cache” setting turned off. Browser fetch normally returns a usable 200 after automatically merging a network 304 with a stored body.
2. Choose **Explicit validators**, load twice, and observe 304 in the request history while the product cards remain. This mode stores copies in tab memory and manually sends validators with browser automatic caching disabled.
3. Choose **Private request**. Inspect `private, no-store`; the response must not be a shared edge HIT.
4. Enter ADMIN_TOKEN, change a price/category, and Save product. The committed product appears immediately; inspect the durable job through Refresh origin status.
5. In simulated mode, simulate purge failure, save a change, and inspect pending attempts/errors. Restore the provider and observe eventual completion. For durable recovery, restart the API while a job is pending; re-enter the admin token and refresh status.
6. Simulate origin failure, issue a read, and observe an uncached 503 locally. Restore the origin. With live Cloudflare, repeat after expiry to measure allowed stale-if-error behavior separately.

Explicit validator mode is an experiment, not a production query-cache library. Refreshing the page clears its manual copies. Provider-only headers may be removed by Cloudflare; lack of Cache-Tag in the browser does not prove the edge lacked it. [Cloudflare tag behavior](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/)

### Origin HTTP examples

```bash
# Capture a representation and its validators.
curl -sS -D /tmp/caching-headers http://127.0.0.1:3000/products/1

# Copy the exact ETag from the first response: 304, no body.
curl -i http://127.0.0.1:3000/products/1 \
  -H 'If-None-Match: W/"<copied-hash>"'

# A mismatching ETag wins over a future date: 200, fresh representation.
curl -i http://127.0.0.1:3000/products/1 \
  -H 'If-None-Match: "different-version"' \
  -H 'If-Modified-Since: Thu, 01 Jan 2099 00:00:00 GMT'

# Read the actual current version first; replace 1 below if it changed.
# Set ADMIN_TOKEN in your shell to the value from .env.
curl -i -X PATCH http://127.0.0.1:3000/products/1 \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  --data '{"expectedVersion":1,"price":1575,"category":"computers"}'

# Existing resource: 412 and no mutation, regardless of expectedVersion.
curl -i -X PATCH http://127.0.0.1:3000/products/1 \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -H 'If-None-Match: *' --data '{"expectedVersion":1,"price":999}'
```

API routes: public GET/HEAD `/products` and `/products/:id`; protected PATCH `/products/:id`; protected GET `/admin/status`; protected POST `/admin/purge`, `/admin/scenarios`, and `/admin/jobs/:uuid/retry`. The web equivalents are under `/api`. Input is whitelisted and unknown fields are rejected. The shared bearer token is a minimal reference adapter; replace it with your application's identity/permissions model for real users.

## Cloudflare deployment and verification

1. Deploy Next.js on your public hostname and the API on a private origin reachable by Next.js. Use HTTPS for public/admin traffic and protect the origin network. Run API with `NODE_ENV=production`, an external DATABASE_URL, a random ADMIN_TOKEN, `CDN_MODE=cloudflare`, and `ALLOW_DEMO_FAILURES=false`.
2. Proxy the public hostname through Cloudflare. Configure a narrowly scoped Cache Rule for GET/HEAD `/api/products` and `/api/products/<id>`. Set **Eligible for cache** and respect origin cache headers; do not add a forced Edge/Browser TTL that contradicts the response policy. Keep stale revalidation allowed.
3. Configure higher-priority bypass behavior for Authorization/Cookie requests, writes, `/api/admin/*`, and all other API paths. Verify rule ordering. Do not apply a broad “cache everything” rule across authenticated application routes. Unsupported query variants must not become normal cached product representations; errors remain no-store.
4. Configure CLOUDFLARE_ZONE_ID and a token scoped to that zone with cache-purge permissions. Never expose it through NEXT_PUBLIC variables. Verify your account's feature availability and provider rule settings.
5. Ensure response rules, Always Online, and other overrides do not defeat the intended stale policy. Measure behavior on the deployed zone rather than inferring it from header strings.

Run this **read-only** check on a quiet, single-origin staging instance:

```bash
DEMO_PUBLIC_URL=https://your-demo.example.com npm run verify:cloudflare
```

It checks a repeat edge HIT, Age, unchanged origin metadata/body counters, and authenticated bypass. It requires the deployed ADMIN_TOKEN and real Cloudflare mode. It does not mutate products or test expiry/purge/stale windows.

For full live verification, record these additional scenarios:

| Scenario | Evidence required |
| --- | --- |
| Cold fill → repeated read | CF-Cache-Status MISS then HIT; repeat does not increment origin read counters |
| Expiry + unchanged origin | Edge revalidation, origin 304, no additional body read |
| Expiry + changed origin | Replacement response contains the committed revision |
| Stale while revalidating | Actual stale response within the allowed window and eventual fresh response; observe provider UPDATING/HIT behavior |
| Eligible origin 5xx | Stale-if-error within its allowance, then failure after the window; never infinite stale serving |
| Write + purge | Pending job, provider success, then MISS/refill with new detail and list revisions |
| Category change | Job includes old and new category tags |
| Authentication/cookie/error | No shared HIT or inappropriate public cache policy |

Use short staging TTLs to test expiry. Public-host reads exercise the edge; direct-origin reads exercise only NestJS. To exercise origin failure in production, use an isolated staging fault at the origin/proxy boundary; production demo failure controls remain disabled.

An emergency manual purge is available:

```bash
PURGE_TAGS=product:1,products npm run purge:cloudflare
```

This script checks provider acknowledgment and exits nonzero on failure. The subsequent edge MISS/new revision remains a separate verification step. [Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/), [tag purging](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/)

## Tests, observability, and delivery

```bash
npm run check             # Both type checks, behavior tests, production web build
npx playwright install chromium
npm run test:e2e          # Production browser → Next proxy → API → PostgreSQL
```

Behavior tests cover HTTP precedence/weak comparison/date precision, bodyless 304/HEAD, private/error policy, input/authentication, conflict handling, concurrent writes, transaction rollback, persisted retry/restart recovery, expired leases, terminal job failures, provider acknowledgment, and proxy forwarding/timeouts. Browser tests cover preserved data on 304, editing, failure recovery, mobile layout, and private reads.

CI also runs the origin tests against an external PostgreSQL service. To do so locally, point `TEST_DATABASE_URL` at a **dedicated disposable test database** and run `node --test tests/api.test.cjs` after building the API. Tests deliberately create a temporary failure trigger; never target application/production data.

`/admin/status` reports metadata reads, body reads, origin 304s, writes, purge successes/failures, and the latest 20 jobs. Counters describe one running API process. An origin 304 proves representation work was skipped; green unit tests do not prove Cloudflare behavior. Preserve live verification output before claiming edge success.

| Evidence level | What it proves |
| --- | --- |
| Type checks/builds | Compile and route generation |
| Local HTTP/database tests | Origin semantics, atomicity, worker behavior |
| Local browser tests | UI/proxy/API flow |
| External PostgreSQL CI | External adapter under tested scenarios |
| Live Cloudflare checks | Actual provider eligibility, headers, origin avoidance, invalidation/stale behavior for the recorded run |

Runtime evidence is environment-specific. CI does not call Cloudflare or spend provider credentials.

## Repository map and operational limits

```text
apps/api/src/http-cache/     # Policy, validators, conditional requests
apps/api/src/products/       # Snapshot reads, versioned writes, outbox insertion
apps/api/src/database/       # Embedded/external PostgreSQL adapters and initialization
apps/api/src/cdn/            # Provider adapter, leases, retries
apps/api/src/admin/          # Protected status, scenarios, manual requeue
apps/web/lib/proxy.ts        # HTTP forwarding without a product framework cache
apps/web/components/         # Browser laboratory
scripts/                    # Startup, manual purge, read-only live checks
tests/                      # HTTP, persistence, proxy, browser scenarios
```

The version-1 schema initializer is idempotent; future deployed schema changes need explicit migrations. Embedded storage is intended for one local process, not a horizontally scaled production database. Revision correctness assumes product writes use the application transaction; manual SQL updates must also advance the resource/catalog revisions and queue invalidation. No custom Redis cache, background warming, service worker, or distributed fill lock is silently introduced.

Operational rollback: bypass the product Cache Rule first so reads reach the functioning origin, then deploy/revert the application independently. Keep the external database and outbox intact; disabling CDN processing leaves jobs pending for later recovery. Do not delete `.data` or a Docker volume as a normal rollback. Browser/application copies are independent; no-store on a new response does not retroactively erase a previously stored one.
