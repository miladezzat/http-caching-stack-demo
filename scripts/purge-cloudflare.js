
import 'dotenv/config';
import fetch from 'node-fetch';

const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const TAGS = (process.env.PURGE_TAGS || '').split(',').map(s => s.trim()).filter(Boolean);

if (!ZONE_ID || !TOKEN || TAGS.length === 0) {
  console.error('Missing CLOUDFLARE_ZONE_ID / CLOUDFLARE_API_TOKEN / PURGE_TAGS envs');
  process.exit(1);
}

const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tags: TAGS }),
});

const json = await res.json();
console.log('Purge response:', JSON.stringify(json, null, 2));
