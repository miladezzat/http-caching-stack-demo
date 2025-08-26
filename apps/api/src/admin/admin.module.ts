
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { CdnService } from '../cdn/cdn.service';
@Module({ controllers: [AdminController], providers: [CdnService] })
export class AdminModule {}
