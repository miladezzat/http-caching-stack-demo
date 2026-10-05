import { BadRequestException } from '@nestjs/common';

export interface Validators { etag: string; lastModified: Date; }
export type ConditionResult = 'proceed' | 'not-modified' | 'precondition-failed';
export type ConditionalHeaders = Record<string, string | string[] | undefined>;

function header(headers: ConditionalHeaders, key: string): string | undefined {
  const value = headers[key];
  if (Array.isArray(value)) throw new BadRequestException(`Multiple ${key} values are not supported`);
  return value;
}

function tags(value: string): string[] | '*' {
  if (value.trim() === '*') return '*';
  // An opaque entity tag may contain commas; split only outside quoted values.
  const found = value.match(/(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"/g);
  if (!found || value.replace(/(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"/g, '').replace(/[\s,]/g, '') ||
      !/^(?:\s*(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"\s*)(?:,\s*(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"\s*)*$/.test(value)) {
    throw new BadRequestException('Invalid entity-tag condition');
  }
  return found;
}

function httpDate(value?: string): number | undefined {
  if (!value || !/^(?:[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Z][a-z]+, \d{2}-[A-Z][a-z]{2}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Z][a-z]{2} [A-Z][a-z]{2} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})$/.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function evaluateConditions(method: string, headers: ConditionalHeaders, current: Validators): ConditionResult {
  const read = method === 'GET' || method === 'HEAD';
  const modified = Math.floor(current.lastModified.getTime() / 1000) * 1000;
  const ifMatch = header(headers, 'if-match');
  if (ifMatch !== undefined) {
    const candidates = tags(ifMatch);
    const match = candidates === '*' || (!current.etag.startsWith('W/') && candidates.some(t => !t.startsWith('W/') && t === current.etag));
    if (!match) return 'precondition-failed';
  } else {
    const date = httpDate(header(headers, 'if-unmodified-since'));
    if (date !== undefined && modified > date) return 'precondition-failed';
  }
  const ifNoneMatch = header(headers, 'if-none-match');
  if (ifNoneMatch !== undefined) {
    const candidates = tags(ifNoneMatch);
    const opaque = current.etag.replace(/^W\//, '');
    const match = candidates === '*' || candidates.some(t => t.replace(/^W\//, '') === opaque);
    if (match) return read ? 'not-modified' : 'precondition-failed';
    return 'proceed'; // If-Modified-Since never overrides If-None-Match.
  }
  if (read) {
    const date = httpDate(header(headers, 'if-modified-since'));
    if (date !== undefined && modified <= date) return 'not-modified';
  }
  return 'proceed';
}
