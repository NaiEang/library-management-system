import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/types/auth-user';
import { RoleName } from '../common/constants';
import { RequestLoanDto } from './dto/request-loan.dto';
import { LoansService } from './loans.service';

@ApiTags('loans')
@ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Roles(RoleName.MEMBER, RoleName.LIBRARIAN, RoleName.ADMIN)
  @Post('request')
  requestLoan(@CurrentUser() user: AuthUser, @Body() dto: RequestLoanDto) {
    return this.loansService.requestLoan(borrowerFor(user, dto.memberId), dto.bookCopyIds);
  }

  @Roles(RoleName.LIBRARIAN, RoleName.ADMIN)
  @Patch(':id/approve')
  approveLoan(@Param('id') id: string) {
    return this.loansService.approveLoan(id);
  }

  @Roles(RoleName.LIBRARIAN, RoleName.ADMIN)
  @Patch(':id/return')
  returnLoan(@Param('id') id: string) {
    return this.loansService.returnLoan(id);
  }
}

// Whose account the loan goes on: a member's own, or the one staff name
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
