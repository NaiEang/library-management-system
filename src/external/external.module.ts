import { Module } from '@nestjs/common';
import { ExternalController } from './external.controller';
import { MembersModule } from '../members/members.module'; 

@Module({
  imports: [MembersModule], 
  controllers: [ExternalController],
})
export class ExternalModule {}