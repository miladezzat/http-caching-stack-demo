import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { AppConfig } from './config';
import { Purger } from './cdn/cdn.service';
import { ErrorFilter } from './common/error.filter';
import { MetricsService } from './observability/metrics.service';

export async function createApp(config: AppConfig, purger?: Purger): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.register(config, purger), { logger: ['error', 'warn'] });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new ErrorFilter());
  const metrics = app.get(MetricsService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    metrics.requests++;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.getHttpAdapter().getInstance().disable('etag');
  return app;
}
