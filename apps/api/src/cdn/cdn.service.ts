import { AppConfig } from '../config';
import { ScenariosService } from '../admin/scenarios.service';

export const PURGER = Symbol('PURGER');
export interface Purger { readonly enabled: boolean; purge(tags: string[]): Promise<void>; }

export class CdnService implements Purger {
  readonly enabled: boolean;
  constructor(private readonly config: AppConfig, private readonly scenarios: ScenariosService, private readonly fetcher: typeof fetch = fetch) {
    this.enabled = config.cdnMode !== 'disabled';
  }
  async purge(tags: string[]) {
    if (!this.enabled) throw new Error('CDN provider is disabled');
    if (this.scenarios.purgeUnavailable) throw new Error('Simulated purge failure');
    if (this.config.cdnMode === 'simulated') return; // Explicit local simulation, never proof of CDN caching.
    const response = await this.fetcher(`https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/purge_cache`, {
      method: 'POST', signal: AbortSignal.timeout(5000), redirect: 'error',
      headers: { Authorization: `Bearer ${this.config.cloudflareToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    });
    const result = await response.json() as { success?: boolean };
    if (!response.ok || result.success !== true) throw new Error(`Cloudflare purge rejected (HTTP ${response.status})`);
  }
}
