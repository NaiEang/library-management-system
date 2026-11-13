import { ApiBearerAuth } from '@nestjs/swagger';
import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiQuery, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthorsService } from './authors.service';
import { CreateAuthorDto } from './dto/create-author.dto';
import { UpdateAuthorDto } from './dto/update-author.dto';

@ApiBearerAuth()
@ApiTags('Authors')
@Controller('authors')
export class AuthorsController {
  constructor(private readonly authorsService: AuthorsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new author' })
  create(@Body() dto: CreateAuthorDto) {
    return this.authorsService.create(dto);
  }
  @Get()
  @ApiOperation({ summary: 'Get list of all authors with optional search' })
  @ApiQuery({ name: 'search', required: false })
  findAll(@Query('search') search?: string) {
    return this.authorsService.findAll(search);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get a single author by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.authorsService.findOne(id);
  }
  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing author' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAuthorDto) {
    return this.authorsService.update(id, dto);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an author by ID' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.authorsService.remove(id);
  }
}