import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';

@Module({
  imports: [HttpModule], 
  controllers: [SpacesController],
  providers: [SpacesService],
})
export class SpacesModule {}