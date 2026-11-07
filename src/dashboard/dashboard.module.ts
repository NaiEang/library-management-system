import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLogsController } from './activity-logs.controller';
import { ActivityLogsService } from './activity-logs.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ActivityLog } from './entities/activity-log.entity';
import { ActivityLogInterceptor } from './interceptors/activity-log.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityLog])],
  controllers: [DashboardController, ActivityLogsController],
  providers: [
    DashboardService,
    ActivityLogsService,
    { provide: APP_INTERCEPTOR, useClass: ActivityLogInterceptor },
  ],
  // For writes the interceptor cannot see, such as logins
  exports: [ActivityLogsService],
})
export class DashboardModule {}
