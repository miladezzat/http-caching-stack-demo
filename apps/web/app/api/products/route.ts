
import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const origin = process.env.API_BASE_URL || 'http://localhost:3000';
  const url = `${origin}/products`;

  const headers: Record<string, string> = {};
  const ifNoneMatch = req.headers.get('if-none-match');
  const ifModifiedSince = req.headers.get('if-modified-since');
  if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch;
  if (ifModifiedSince) headers['If-Modified-Since'] = ifModifiedSince;

  const res = await fetch(url, { headers, redirect: 'manual' });
  const passHeaders = new Headers();
  ['etag','last-modified','cache-control','vary','surrogate-key','cache-tag'].forEach(h => {
    const v = res.headers.get(h);
    if (v) passHeaders.set(h, v);
  });

  if (res.status === 304) return new Response(null, { status: 304, headers: passHeaders });
  const data = await res.text();
  return new Response(data, { status: res.status, headers: passHeaders });
}
