import { ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppConfig, CONFIG } from '../config';

@Injectable()
export class ScenariosService {
  originUnavailable = false;
  purgeUnavailable = false;
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}
  set(values: { originUnavailable?: boolean; purgeUnavailable?: boolean }) {
    if (!this.config.allowFailures) throw new ForbiddenException('Demo failure controls are disabled');
    if (values.originUnavailable !== undefined) this.originUnavailable = values.originUnavailable;
    if (values.purgeUnavailable !== undefined) this.purgeUnavailable = values.purgeUnavailable;
    return { originUnavailable: this.originUnavailable, purgeUnavailable: this.purgeUnavailable };
  }
  assertOrigin() { if (this.originUnavailable) throw new ServiceUnavailableException('Simulated origin failure'); }
}
