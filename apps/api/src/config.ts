import { resolve } from 'node:path';

export const CONFIG = Symbol('CONFIG');
export type AppConfig = ReturnType<typeof loadConfig>;

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, min = 1, max = 86400): number {
  const value = env[key] === undefined ? fallback : Number(env[key]);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.CDN_MODE ?? 'disabled';
  if (!['disabled', 'simulated', 'cloudflare'].includes(mode)) throw new Error('Invalid CDN_MODE');
  const adminToken = env.ADMIN_TOKEN ?? '';
  if (adminToken.length < 24) throw new Error('ADMIN_TOKEN must contain at least 24 characters');
  const allowFailures = env.ALLOW_DEMO_FAILURES === 'true';
  if (env.NODE_ENV === 'production' && (allowFailures || mode === 'simulated')) {
    throw new Error('Production requires ALLOW_DEMO_FAILURES=false and a non-simulated CDN_MODE');
  }
  if (mode === 'cloudflare' && (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ZONE_ID ?? '') || !env.CLOUDFLARE_API_TOKEN)) {
    throw new Error('Cloudflare mode requires a valid zone ID and API token');
  }
  const repositoryRoot = resolve(__dirname, '../../..');
  const directory = env.DATA_DIR ?? '.data/postgres';
  return {
    port: integer(env, 'PORT', 3000, 0, 65535),
    host: env.API_HOST ?? '127.0.0.1',
    adminToken,
    databaseUrl: env.DATABASE_URL,
    dataDir: directory === 'memory://' ? directory : resolve(repositoryRoot, directory),
    cdnMode: mode as 'disabled' | 'simulated' | 'cloudflare',
    zoneId: env.CLOUDFLARE_ZONE_ID ?? '',
    cloudflareToken: env.CLOUDFLARE_API_TOKEN ?? '',
    allowFailures,
    purgePollMs: integer(env, 'PURGE_POLL_MS', 1000, 50, 60000),
    listEdgeTtl: integer(env, 'LIST_EDGE_TTL', 60),
    detailEdgeTtl: integer(env, 'DETAIL_EDGE_TTL', 300),
  };
}
