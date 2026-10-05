import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfig, CONFIG } from '../config';
import { DatabaseService } from '../database/database.service';
import { MetricsService } from '../observability/metrics.service';
import { PURGER, Purger } from './cdn.service';

type Job = { id: string; tags: string[]; attempts: number; lease_token: string };
@Injectable()
export class PurgeWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = false;
  constructor(private readonly db: DatabaseService, @Inject(PURGER) private readonly purger: Purger,
    @Inject(CONFIG) private readonly config: AppConfig, private readonly metrics: MetricsService) {}
  onApplicationBootstrap() {
    if (this.purger.enabled) {
      this.timer = setInterval(() => { void this.tick().catch(() => { this.metrics.purgesFailed++; }); }, this.config.purgePollMs);
      this.timer.unref();
    }
  }
  tick(): Promise<void> {
    if (this.stopped || !this.purger.enabled) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.processOne().finally(() => { this.running = undefined; });
    return this.running;
  }
  private async processOne() {
    const job = await this.db.transaction(async tx => {
      const { rows } = await tx.query<Job>(`SELECT id,tags,attempts FROM purge_jobs
        WHERE (status='pending' AND available_at<=clock_timestamp())
        OR (status='processing' AND lease_until<=clock_timestamp())
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`);
      if (!rows[0]) return undefined;
      return (await tx.query<Job>(`UPDATE purge_jobs SET status='processing', attempts=attempts+1,
        lease_until=clock_timestamp()+interval '30 seconds', lease_token=$2 WHERE id=$1
        RETURNING id,tags,attempts,lease_token`, [rows[0].id, randomUUID()])).rows[0];
    });
    if (!job) return;
    try {
      await this.purger.purge(job.tags);
      await this.db.transaction(tx => tx.query(`UPDATE purge_jobs SET status='done',completed_at=clock_timestamp(),
        lease_until=NULL,lease_token=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2`, [job.id, job.lease_token]));
      this.metrics.purgesSucceeded++;
    } catch (error) {
      const retryAt = new Date(Date.now() + Math.min(60000, 1000 * 2 ** Math.min(job.attempts - 1, 6)) + Math.floor(Math.random() * 250));
      // Never persist provider response bodies, authorization headers, or credential-bearing URLs.
      const message = error instanceof Error && /^(Simulated purge failure|Cloudflare purge rejected \(HTTP \d{3}\))$/.test(error.message)
        ? error.message : 'Purge provider request failed';
      await this.db.transaction(tx => tx.query(`UPDATE purge_jobs SET status=$3,available_at=$4,
        lease_until=NULL,lease_token=NULL,last_error=$5 WHERE id=$1 AND lease_token=$2`,
        [job.id, job.lease_token, job.attempts >= 8 ? 'failed' : 'pending', retryAt, message]));
      this.metrics.purgesFailed++;
    }
  }
  async onModuleDestroy() {
    this.stopped = true;
    clearInterval(this.timer);
    await this.running;
  }
}
