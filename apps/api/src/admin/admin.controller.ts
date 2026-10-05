import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { AppConfig, CONFIG } from '../config';
import { DatabaseService } from '../database/database.service';
import { MetricsService } from '../observability/metrics.service';
import { AdminGuard } from './admin.guard';
import { ScenariosService } from './scenarios.service';

class PurgeDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({ each: true })
  @MaxLength(128, { each: true }) @Matches(/^[a-z0-9:-]+$/, { each: true }) tags!: string[];
}
class ScenarioDto {
  @IsOptional() @IsBoolean() originUnavailable?: boolean;
  @IsOptional() @IsBoolean() purgeUnavailable?: boolean;
}
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly db: DatabaseService, private readonly metrics: MetricsService,
    private readonly scenarios: ScenariosService, @Inject(CONFIG) private readonly config: AppConfig) {}
  @Get('status')
  async status() {
    const jobs = await this.db.transaction(tx => tx.query(`SELECT id,tags,status,attempts,last_error,
      created_at,completed_at FROM purge_jobs ORDER BY created_at DESC LIMIT 20`), true);
    return { cdnMode: this.config.cdnMode, failureControlsEnabled: this.config.allowFailures,
      databaseMode: this.config.databaseUrl ? 'external-postgresql' : 'embedded-postgresql',
      metrics: this.metrics, scenarios: { originUnavailable: this.scenarios.originUnavailable, purgeUnavailable: this.scenarios.purgeUnavailable }, jobs: jobs.rows };
  }
  @Post('purge')
  async purge(@Body() body: PurgeDto) {
    const id = randomUUID();
    await this.db.transaction(tx => tx.query('INSERT INTO purge_jobs(id,tags) VALUES ($1,$2)', [id, [...new Set(body.tags)]]));
    return { jobId: id, status: 'pending', provider: this.config.cdnMode };
  }
  @Post('jobs/:id/retry')
  async retry(@Param('id', new ParseUUIDPipe()) id: string) {
    const { rows } = await this.db.transaction(tx => tx.query(`UPDATE purge_jobs SET status='pending',attempts=0,
      available_at=clock_timestamp(),last_error=NULL WHERE id=$1 AND status='failed' RETURNING id`, [id]));
    if (!rows.length) throw new NotFoundException('Failed job not found');
    return { jobId: id, status: 'pending' };
  }
  @Post('scenarios')
  scenario(@Body() body: ScenarioDto) { return this.scenarios.set(body); }
}
