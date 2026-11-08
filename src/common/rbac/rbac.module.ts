import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DevUsersController } from './dev-users.controller';
import { RolesGuard } from './roles.guard';

@Module({
  controllers: [DevUsersController],
  providers: [{ provide: APP_GUARD, useClass: RolesGuard }],
})
export class RbacModule {}
