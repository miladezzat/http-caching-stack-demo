
import { Module } from '@nestjs/common';
import { ProductsModule } from './products/products.module';
import { AdminModule } from './admin/admin.module';

@Module({ imports: [ProductsModule, AdminModule] })
export class AppModule {}
