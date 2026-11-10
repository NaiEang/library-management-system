import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '../common/constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActivityLogsService } from './activity-logs.service';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';

@ApiTags('activity-logs')
@ApiBearerAuth()
@Roles(RoleName.ADMIN, RoleName.LIBRARIAN)
@Controller('activity-logs')
export class ActivityLogsController {
  constructor(private readonly activityLogs: ActivityLogsService) {}

  @Get()
  findAll(@Query() query: ActivityLogQueryDto) {
    return this.activityLogs.findAll(query);
  }

  @Get('facets')
  facets() {
    return this.activityLogs.facets();
  }
}
