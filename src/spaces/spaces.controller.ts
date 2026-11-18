import { Controller, Get, Post, Body, UseGuards, Param } from '@nestjs/common';
import { SpacesService } from './spaces.service';
import { ApiKeyGuard } from './api-key.guard';

@Controller('api/v1/spaces')
export class SpacesController {
  constructor(private readonly spacesService: SpacesService) {}

  @Get()
  async getSpacesForFrontend() {
    return this.spacesService.getAvailableSpaces();
  }

  @UseGuards(ApiKeyGuard)
  @Get('external/student-status/:studentId')
  checkLibraryStatus(@Param('studentId') studentId: string) {
    return {
      studentId,
      hasOverdueBooks: false,
      message: 'B2B Connection successful - Approved by LibraFlow'
    };
  }
}