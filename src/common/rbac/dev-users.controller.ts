import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { devAuthEnabled } from './dev-user.middleware';
import { Public } from './roles.decorator';

/** Feeds the dashboard's "Acting as" picker while DEV_AUTH is on. */
@ApiExcludeController()
@Controller('dev')
export class DevUsersController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  @Get('users')
  users() {
    if (!devAuthEnabled()) throw new NotFoundException();
    return this.dataSource.query(`
      (SELECT u.id, u.username, concat_ws(' ', u.first_name, u.last_name) AS name, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.name IN ('admin', 'librarian') AND u.status = 'active'
       ORDER BY r.name, u.id)
      UNION ALL
      (SELECT u.id, u.username, concat_ws(' ', u.first_name, u.last_name) AS name, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'member' AND u.status = 'active'
       ORDER BY u.id LIMIT 3)`);
  }
}
