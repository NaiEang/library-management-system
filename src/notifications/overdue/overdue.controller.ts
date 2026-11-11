import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RoleName } from '../../common/constants';
import { OverdueScanService, type OverdueScanResult } from './overdue-scan.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications/overdue')
export class OverdueController {
  constructor(private readonly overdueScan: OverdueScanService) {}

  // Same work as the daily cron, on demand. Safe to repeat: each item gets
  // at most one reminder per library day.
  @ApiOperation({ summary: 'Run the overdue scan now and queue reminders' })
  @Roles(RoleName.ADMIN, RoleName.LIBRARIAN)
  @Post('scan')
  @HttpCode(200)
  scan(): Promise<OverdueScanResult> {
    return this.overdueScan.scan();
  }
}
