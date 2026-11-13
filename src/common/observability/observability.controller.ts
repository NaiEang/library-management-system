import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Query,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { RoleName } from '../constants';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { appLogger } from './app-logger';
import { MetricsService } from './metrics.service';
import { traceStore } from './trace-store';

@ApiTags('observability')
// Unversioned and outside /api: /health, /metrics, /observability/*
@Controller({ version: VERSION_NEUTRAL })
export class ObservabilityController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly dataSource: DataSource,
  ) {}

  /** Prometheus scrape target. */
  @Public()
  @ApiExcludeEndpoint()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  prometheus() {
    return this.metrics.registry.metrics();
  }

  @Public()
  @Get('health')
  async health() {
    const started = performance.now();
    await this.dataSource.query('SELECT 1');
    return {
      status: 'ok',
      db: {
        status: 'up',
        latencyMs: +(performance.now() - started).toFixed(1),
      },
    };
  }

  @Roles(RoleName.ADMIN)
  @Get('observability/metrics')
  metricsSummary() {
    return this.metrics.summary();
  }

  @Roles(RoleName.ADMIN)
  @Get('observability/traces')
  traces(
    @Query('route') route?: string,
    @Query('errorsOnly', new ParseBoolPipe({ optional: true }))
    errorsOnly?: boolean,
    @Query('minDurationMs', new ParseIntPipe({ optional: true }))
    minDurationMs?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return traceStore.list({ route, errorsOnly, minDurationMs, limit });
  }

  @Roles(RoleName.ADMIN)
  @Get('observability/traces/:traceId')
  trace(@Param('traceId') traceId: string) {
    const found = traceStore.get(traceId);
    if (!found)
      throw new NotFoundException(
        `Trace ${traceId} not found (only the latest 500 are kept)`,
      );
    return {
      ...found,
      logs: appLogger.query({ traceId, limit: 100 }).reverse(),
    };
  }

  @Roles(RoleName.ADMIN)
  @Get('observability/logs')
  logs(
    @Query('level') level?: string,
    @Query('traceId') traceId?: string,
    @Query('context') context?: string,
    @Query('search') search?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return appLogger.query({ level, traceId, context, search, limit });
  }
}
