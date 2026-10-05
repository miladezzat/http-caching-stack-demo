import { DynamicModule, Module } from '@nestjs/common';
import { AppConfig, CONFIG, loadConfig } from './config';
import { DatabaseService } from './database/database.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { CacheResponder } from './http-cache/cache-responder.service';
import { MetricsService } from './observability/metrics.service';
import { AdminController } from './admin/admin.controller';
import { AdminGuard } from './admin/admin.guard';
import { ScenariosService } from './admin/scenarios.service';
import { CdnService, PURGER, Purger } from './cdn/cdn.service';
import { PurgeWorker } from './cdn/purge-worker.service';

@Module({})
export class AppModule {
  static register(config: AppConfig = loadConfig(), purger?: Purger): DynamicModule {
    return { module: AppModule, controllers: [ProductsController, AdminController], providers: [
      { provide: CONFIG, useValue: config }, DatabaseService, ProductsService, CacheResponder,
      MetricsService, AdminGuard, ScenariosService, PurgeWorker,
      purger ? { provide: PURGER, useValue: purger } : {
        provide: PURGER, inject: [CONFIG, ScenariosService],
        useFactory: (configuration: AppConfig, scenarios: ScenariosService) => new CdnService(configuration, scenarios),
      },
    ] };
  }
}
