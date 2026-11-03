import { Controller, Post, Body, Param, Patch } from '@nestjs/common';
import { LoansService } from './loans.service';
import { RequestLoanDto } from './dto/request-loan.dto';

@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post('request')
  requestLoan(@Body() requestLoanDto: RequestLoanDto) {
    return this.loansService.requestLoan(requestLoanDto.memberId, requestLoanDto.bookCopyIds);
  }

  @Patch(':id/approve')
  approveLoan(@Param('id') id: string) {
    return this.loansService.approveLoan(id);
  }

  @Patch(':id/return')
  returnLoan(@Param('id') id: string) {
    return this.loansService.returnLoan(id);
  }
}