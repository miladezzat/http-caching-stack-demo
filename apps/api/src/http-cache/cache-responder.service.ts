import { HttpException, Inject, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppConfig, CONFIG } from '../config';
import { MetricsService } from '../observability/metrics.service';
import { evaluateConditions, Validators } from './conditions';

@Injectable()
export class CacheResponder {
  constructor(@Inject(CONFIG) private readonly config: AppConfig, private readonly metrics: MetricsService) {}

  async reply(req: Request, res: Response, current: Validators, tags: string[], detail: boolean, load: () => Promise<unknown>) {
    const condition = evaluateConditions(req.method, req.headers, current);
    if (condition === 'precondition-failed') throw new HttpException('Precondition failed', 412);
    const isPublic = !req.headers.authorization && !req.headers.cookie;
    res.setHeader('ETag', current.etag);
    res.setHeader('Last-Modified', current.lastModified.toUTCString());
    res.setHeader('Vary', 'Accept-Encoding');
    if (isPublic) {
      res.setHeader('Cache-Control', 'public, max-age=0');
      res.setHeader('Cloudflare-CDN-Cache-Control', `public, max-age=${detail ? this.config.detailEdgeTtl : this.config.listEdgeTtl}, stale-while-revalidate=${detail ? 60 : 30}, stale-if-error=60`);
      res.setHeader('Cache-Tag', [...new Set(tags)].join(','));
    }
    if (condition === 'not-modified') {
      this.metrics.notModified++;
      res.status(304).end();
      return;
    }
    res.type('application/json');
    if (req.method === 'HEAD') { res.status(200).end(); return; }
    const data = await load();
    res.status(200).send(JSON.stringify(data));
  }
}
