
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { CACHE_POLICY_KEY } from './cache-policy.decorator';
import { CachePolicyOptions } from './types';
import { computeETag } from './etag.util';

function buildCacheControl(policy: CachePolicyOptions): string {
  const parts: string[] = [];
  const scope = policy.scope ?? (policy.sMaxAge != null ? 'public' : 'private');
  parts.push(scope);
  const maxAge = policy.maxAge ?? 0;
  parts.push(`max-age=${maxAge}`);
  if (policy.sMaxAge != null) parts.push(`s-maxage=${policy.sMaxAge}`);
  if (policy.staleWhileRevalidate != null) parts.push(`stale-while-revalidate=${policy.staleWhileRevalidate}`);
  if (policy.staleIfError != null) parts.push(`stale-if-error=${policy.staleIfError}`);
  return parts.join(', ');
}

@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: any) {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const policy = this.reflector.get<CachePolicyOptions>(CACHE_POLICY_KEY, context.getHandler()) ?? {};

    if (policy.vary && policy.vary.length) {
      const existing = res.getHeader('Vary');
      const existingVals = new Set(String(existing || '').split(',').map(v => v.trim()).filter(Boolean));
      for (const v of policy.vary) existingVals.add(v);
      if (existingVals.size) res.setHeader('Vary', Array.from(existingVals).join(', '));
    }

    if (policy.tags && policy.tags.length) {
      const tags = Array.from(new Set(policy.tags));
      res.setHeader('Surrogate-Key', tags.join(' '));
      res.setHeader('Cache-Tag', tags.join(','));
    }

    return next.handle().pipe(map((data: any) => {
      let lastModified: Date | undefined;
      if (policy.lastModifiedField && data && typeof data === 'object') {
        const candidate = (data as any)[policy.lastModifiedField];
        if (candidate) lastModified = new Date(candidate);
      }
      if (!lastModified) lastModified = new Date();

      const etag = computeETag(data, policy.etag ?? 'weak');
      const ifNoneMatch = req.headers['if-none-match'];
      const ifModifiedSince = req.headers['if-modified-since'] ? new Date(req.headers['if-modified-since'] as string) : undefined;

      let notModified = false;
      if (ifNoneMatch && typeof ifNoneMatch === 'string') {
        const list = ifNoneMatch.split(',').map((s: string) => s.trim());
        if (list.includes(etag) || list.includes('*')) notModified = true;
      }
      if (!notModified && ifModifiedSince) {
        if (lastModified.getTime() <= ifModifiedSince.getTime()) notModified = true as any;
      }

      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', lastModified.toUTCString());
      res.setHeader('Cache-Control', buildCacheControl(policy));

      if (notModified) {
        res.status(304);
        return undefined;
      }
      return data;
    }));
  }
}
