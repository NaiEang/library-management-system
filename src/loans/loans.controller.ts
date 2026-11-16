import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/types/auth-user';
import { RoleName } from '../common/constants';
import { MyLoansQueryDto } from './dto/my-loans-query.dto';
import { RequestLoanDto } from './dto/request-loan.dto';
import { LoanNotificationService } from './loan-notification.service';
import { LoansService } from './loans.service';

@ApiTags('loans')
@ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(
    private readonly loansService: LoansService,
    private readonly loanNotifications: LoanNotificationService,
  ) {}

  @ApiOperation({ summary: 'List my loans (member)' })
  @Roles(RoleName.MEMBER)
  @Get('my')
  myLoans(@CurrentUser() user: AuthUser, @Query() query: MyLoansQueryDto) {
    if (!user.memberId) throw new ForbiddenException();
    return this.loansService.findByMember(user.memberId, query);
  }

  @Roles(RoleName.MEMBER, RoleName.LIBRARIAN, RoleName.ADMIN)
  @Get(':id')
  getLoan(@Param('id') id: string) {
    return this.loansService.getLoan(id);
  }

  @Roles(RoleName.MEMBER, RoleName.LIBRARIAN, RoleName.ADMIN)
  @Post('request')
  requestLoan(@CurrentUser() user: AuthUser, @Body() dto: RequestLoanDto) {
    return this.loansService.requestLoan(borrowerFor(user, dto.memberId), dto.bookCopyIds);
  }

  @Roles(RoleName.LIBRARIAN, RoleName.ADMIN)
  @Patch(':id/approve')
  async approveLoan(@Param('id') id: string) {
    const loan = await this.loansService.approveLoan(id);
    this.loanNotifications.onApproved(loan);
    return loan;
  }

  @ApiOperation({ summary: 'Reject a pending loan request' })
  @Roles(RoleName.LIBRARIAN, RoleName.ADMIN)
  @Patch(':id/reject')
  async rejectLoan(@Param('id') id: string) {
    const result = await this.loansService.rejectLoan(id);
    this.loanNotifications.onRejected(result as never);
    return result;
  }

  @Roles(RoleName.LIBRARIAN, RoleName.ADMIN)
  @Patch(':id/return')
  returnLoan(@Param('id') id: string) {
    return this.loansService.returnLoan(id);
  }
}

export function borrowerFor(user: AuthUser, requestedMemberId?: string): string {
  if (user.role === RoleName.MEMBER) {
    if (!user.memberId) throw new ForbiddenException();
    if (requestedMemberId && requestedMemberId !== user.memberId) {
      throw new ForbiddenException('Members can only borrow for themselves.');
    }
    return user.memberId;
  }
  if (!requestedMemberId) {
    throw new BadRequestException('memberId is required when staff request a loan.');
  }
  return requestedMemberId;
}
