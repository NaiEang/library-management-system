import { Controller, Get, Module } from '@nestjs/common';
import { CurrentUser } from '../../../src/auth/decorators/current-user.decorator';
import { Public } from '../../../src/auth/decorators/public.decorator';
import { Roles } from '../../../src/auth/decorators/roles.decorator';
import type { AuthUser } from '../../../src/auth/types/auth-user';
import { RoleName } from '../../../src/users/enums/role-name.enum';

// Test-only routes that exercise the guard contract the way teammates will use it.
@Controller('contract')
export class ContractTestController {
  @Public()
  @Get('public')
  guest() {
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Roles(RoleName.ADMIN)
  @Get('admin')
  admin() {
    return { ok: true };
  }

  @Roles(RoleName.LIBRARIAN, RoleName.ADMIN)
  @Get('staff')
  staff() {
    return { ok: true };
  }

  @Public()
  @Roles(RoleName.ADMIN)
  @Get('public-with-roles')
  contradictory() {
    return { ok: true };
  }
}

@Module({ controllers: [ContractTestController] })
export class ContractTestModule {}
