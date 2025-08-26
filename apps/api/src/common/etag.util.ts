
import { createHash } from 'crypto';
export function computeETag(body: any, mode: 'weak' | 'strong' = 'weak'): string {
  const json = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  const hash = createHash('sha1').update(json).digest('hex');
  return mode === 'weak' ? `W/"${hash}"` : `"${hash}"`;
}
