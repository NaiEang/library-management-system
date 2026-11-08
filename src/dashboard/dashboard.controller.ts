import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '../common/constants';
import { Roles } from '../common/rbac/roles.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Roles(RoleName.ADMIN, RoleName.LIBRARIAN)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /** Stat cards and chart series for the admin/librarian dashboard. */
  @Get('stats')
  getStats() {
    return this.dashboardService.getStats();
  }
}
