import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  readonly startedAt = new Date().toISOString();
  requests = 0;
  metadataReads = 0;
  bodyReads = 0;
  notModified = 0;
  writes = 0;
  purgesSucceeded = 0;
  purgesFailed = 0;
}
