import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BuyGoldDto } from '../members/dto/buy-gold.dto';
import {
  GoldMembershipResponse,
  GoldMembershipService,
} from '../members/gold-membership.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '../common/constants';
import { IdParamPipe } from '../common/pipes/id-param.pipe';
import { LogActivity } from '../dashboard/decorators/log-activity.decorator';
import { ListMembersQueryDto } from '../members/dto/list-members-query.dto';
import {
  MemberListItem,
  MemberListPage,
  MembersService,
} from '../members/members.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffAccountResponse, UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly membersService: MembersService,
    private readonly goldMembership: GoldMembershipService,
  ) {}

  // Managers and admins create librarians; nobody can self-register as staff.
  @Roles(RoleName.MANAGER)
  @Post('librarians')
  createLibrarian(@Body() dto: CreateStaffDto): Promise<StaffAccountResponse> {
    return this.usersService.createStaff(RoleName.LIBRARIAN, dto);
  }

  // Only admins create managers (a manager will later run one campus).
  @Roles(RoleName.ADMIN)
  @Post('managers')
  createManager(@Body() dto: CreateStaffDto): Promise<StaffAccountResponse> {
    return this.usersService.createStaff(RoleName.MANAGER, dto);
  }

  // The librarian's member list: paged, filterable by membership status,
  // searchable by email, username or member code.
  @Roles(RoleName.LIBRARIAN, RoleName.ADMIN)
  @Get('members')
  listMembers(@Query() query: ListMembersQueryDto): Promise<MemberListPage> {
    return this.membersService.list(query);
  }

  // :id is the member's user id. The amount comes from DEPOSIT_AMOUNT, and who
  // verified it comes from the token, never from the request.
  @Roles(RoleName.LIBRARIAN, RoleName.ADMIN)
  @LogActivity({ action: 'VERIFY_DEPOSIT', entityType: 'User' })
  @Patch(':id/verify-deposit')
  verifyDeposit(
    @Param('id', IdParamPipe) userId: string,
    @CurrentUser('id') staffId: string,
  ): Promise<MemberListItem> {
    return this.membersService.verifyDeposit(userId, staffId);
  }

  // The member paid the yearly gold fee at the desk: upgrades a standard
  // member, or renews gold (only in its last 30 days). Records the payment.
  // POST, not PATCH: every successful call charges the fee once.
  @Roles(RoleName.LIBRARIAN)
  @LogActivity({ action: 'GOLD_MEMBERSHIP', entityType: 'User' })
  @Post(':id/gold-membership')
  buyGold(
    @Param('id', IdParamPipe) userId: string,
    @Body() dto: BuyGoldDto,
  ): Promise<GoldMembershipResponse> {
    return this.goldMembership.buyGold(userId, dto.paymentMethod);
  }
}
