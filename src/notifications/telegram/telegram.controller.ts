import { Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TelegramLinkService } from './telegram-link.service';

// Any logged-in user manages their own Telegram reminders.
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications/telegram')
export class TelegramController {
  constructor(private readonly links: TelegramLinkService) {}

  @ApiOperation({
    summary: 'Get a one-time link that connects your Telegram for reminders',
    description:
      'Open the url and press Start in Telegram; the bot links your account. ' +
      'Valid 15 minutes. 503 when the server has no Telegram bot configured.',
  })
  @Post('link')
  createLink(@CurrentUser('id') userId: string) {
    return this.links.createLink(userId);
  }

  @ApiOperation({ summary: 'Whether your Telegram is linked' })
  @Get()
  status(@CurrentUser('id') userId: string) {
    return this.links.status(userId);
  }

  @ApiOperation({ summary: 'Stop Telegram reminders (unlink)' })
  @Delete()
  @HttpCode(204)
  async unlink(@CurrentUser('id') userId: string): Promise<void> {
    await this.links.unlink(userId);
  }
}
