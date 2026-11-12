import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../../src/auth/decorators/current-user.decorator';
import { GoldMember } from '../../../src/auth/decorators/gold-member.decorator';
import { Public } from '../../../src/auth/decorators/public.decorator';
import { Roles } from '../../../src/auth/decorators/roles.decorator';
import { RoleName } from '../../../src/common/constants';

// Test-only routes that use @GoldMember() the way teammates will (Space
// Booking rooms, limited-edition books).
@Controller('gold-test')
export class GoldTestController {
  @Get('open')
  open() {
    return { ok: true };
  }

  @GoldMember()
  @Get('rooms')
  rooms(@CurrentUser('memberId') memberId: string) {
    return { ok: true, memberId };
  }

  @Public()
  @GoldMember()
  @Get('public-and-gold')
  contradictory() {
    return { ok: true };
  }

  @Roles(RoleName.LIBRARIAN)
  @GoldMember()
  @Get('staff-and-gold')
  staffAndGold() {
    return { ok: true };
  }
}

@GoldMember()
@Controller('gold-test-class')
export class GoldClassTestController {
  @Get('a')
  a() {
    return { ok: true };
  }

  @Get('b')
  b() {
    return { ok: true };
  }
}
