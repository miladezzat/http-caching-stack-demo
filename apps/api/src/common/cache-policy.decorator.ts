
import { SetMetadata } from '@nestjs/common';
import { CachePolicyOptions } from './types';
export const CACHE_POLICY_KEY = 'cache:policy';
export const CachePolicy = (policy: CachePolicyOptions) => SetMetadata(CACHE_POLICY_KEY, policy);
