import { Body, Controller, Header, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '../../common/constants';
import { IdParamPipe } from '../../common/pipes/id-param.pipe';
import { LogActivity } from '../../dashboard/decorators/log-activity.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import type { AuthUser } from '../types/auth-user';
import {
  AccountStatusResponse,
  AccountsService,
  PasswordResetResponse,
} from './accounts.service';
import { SetAccountStatusDto } from './dto/set-status.dto';

// Account administration under /users. It lives in the auth module because it
// needs the session store (the auth module already imports the users module).
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserAccountsController {
  constructor(private readonly accounts: AccountsService) {}

  // Managers and admins; who may change whom is checked in the service.
  @Roles(RoleName.MANAGER)
  @LogActivity({ action: 'SET_ACCOUNT_STATUS', entityType: 'User' })
  @Patch(':id/status')
  setStatus(
    @Param('id', IdParamPipe) id: string,
    @Body() dto: SetAccountStatusDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<AccountStatusResponse> {
    return this.accounts.setStatus(id, dto.enabled, actor);
  }

  // Every staff role (the ladder lets managers and admins in); who may reset
  // whom is checked in the service.
  @Roles(RoleName.LIBRARIAN)
  @LogActivity({ action: 'RESET_PASSWORD', entityType: 'User' })
  @Header('Cache-Control', 'no-store')
  @Post(':id/reset-password')
  resetPassword(
    @Param('id', IdParamPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<PasswordResetResponse> {
    return this.accounts.resetPassword(id, actor);
  }
}
