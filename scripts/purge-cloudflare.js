
import 'dotenv/config';

const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const TAGS = (process.env.PURGE_TAGS || '').split(',').map(s => s.trim()).filter(Boolean);

if (!/^[a-f0-9]{32}$/i.test(ZONE_ID || '') || !TOKEN || TAGS.length === 0 || TAGS.length > 100 || TAGS.some(tag => !/^[a-z0-9:-]{1,128}$/.test(tag))) {
  console.error('Require a valid CLOUDFLARE_ZONE_ID, API token, and 1–100 valid PURGE_TAGS');
  process.exit(1);
}

const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`, {
  method: 'POST',
  signal: AbortSignal.timeout(5000),
  redirect: 'error',
  headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tags: TAGS }),
});

const json = await res.json();
if (!res.ok || json.success !== true) {
  console.error(`Purge failed (HTTP ${res.status})`);
  process.exitCode = 1;
} else console.log(`Cloudflare accepted purge of ${TAGS.length} tag(s). Verify the subsequent edge response separately.`);
