import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { AppConfig, CONFIG } from '../config';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}
  canActivate(context: ExecutionContext) {
    const actual = Buffer.from(context.switchToHttp().getRequest().headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${this.config.adminToken}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new UnauthorizedException();
    return true;
  }
}
