import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { MembershipService } from '../members/membership.service'; 
import { Member } from '../members/entities/member.entity'
import { DataSource } from 'typeorm';

@Controller('external')
@UseGuards(ApiKeyGuard)
export class ExternalController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('members/eligibility')
  async checkEligibility(@Query('email') email: string) {
    if (!email) {
      throw new BadRequestException('Email query parameter is required');
    }

    const member = await this.dataSource.manager.findOne(Member, {
      where: { user: { email: email } },
      relations: { user: true },
    });

    if (!member) {
      return { 
        email, 
        isRegistered: false, 
        canBookSpace: false, 
        reason: 'Not a library member' 
      };
    }

    if (Number(member.depositAmount) < 5) {
      return { 
        email, 
        isRegistered: true, 
        canBookSpace: false, 
        reason: 'Deposit not paid' 
      };
    }

    const now = new Date();
    if (member.blockedUntil && member.blockedUntil > now) {
      return { 
        email, 
        isRegistered: true, 
        canBookSpace: false, 
        reason: 'Account blocked due to overdue books' 
      };
    }

    return { 
      email, 
      isRegistered: true, 
      canBookSpace: true, 
      reason: null 
    };
  }
}