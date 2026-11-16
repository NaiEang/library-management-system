import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ApiKeyGuard } from './api-key.guard';
import { EligibilityResponseDto } from './dto/eligibility-response.dto';
import { ExternalService } from './external.service';

@ApiTags('external')
@ApiSecurity('x-api-key')
@Public()
@UseGuards(ApiKeyGuard)
@Controller('external')
export class ExternalController {
  constructor(private readonly externalService: ExternalService) {}

  @ApiOperation({
    summary: 'Check whether a library member may book a space',
    description:
      'Called by partner services (e.g. Space Booking) to verify that ' +
      'the person is a registered, active library member who is not ' +
      'blocked. Requires the x-api-key header.',
  })
  @ApiQuery({ name: 'email', required: true, example: 'student@example.com' })
  @ApiOkResponse({ type: EligibilityResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid x-api-key' })
  @ApiBadRequestResponse({ description: 'Missing email query parameter' })
  @Get('members/eligibility')
  checkEligibility(@Query('email') email?: string) {
    if (!email) {
      throw new BadRequestException('email query parameter is required');
    }
    return this.externalService.checkEligibility(email);
  }
}
