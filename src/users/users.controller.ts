import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '../common/constants';
import { CreateLibrarianDto } from './dto/create-librarian.dto';
import { StaffAccountResponse, UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Only an admin creates librarians; nobody can self-register as staff.
  @Roles(RoleName.ADMIN)
  @Post('librarians')
  createLibrarian(
    @Body() dto: CreateLibrarianDto,
  ): Promise<StaffAccountResponse> {
    return this.usersService.createLibrarian(dto);
  }
}
