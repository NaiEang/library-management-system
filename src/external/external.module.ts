import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Member } from '../members/entities/member.entity';
import { MembersModule } from '../members/members.module';
import { ApiKeyGuard } from './api-key.guard';
import { ExternalController } from './external.controller';
import { ExternalService } from './external.service';

@Module({
  imports: [TypeOrmModule.forFeature([Member]), MembersModule],
  controllers: [ExternalController],
  providers: [ExternalService, ApiKeyGuard],
})
export class ExternalModule {}
