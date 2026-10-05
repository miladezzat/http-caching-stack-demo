import { createHash } from 'node:crypto';
import { Validators } from './conditions';

export function validators(key: string, version: number, updatedAt: Date): Validators {
  // Bump json-v1 when a representation changes independently of resource writes.
  const hash = createHash('sha256').update(`json-v1:${key}:${version}`).digest('hex');
  return { etag: `W/"${hash}"`, lastModified: updatedAt };
}
