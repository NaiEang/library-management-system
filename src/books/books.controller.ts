import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { BooksService } from './books.service';
import { BooksCatalogService } from './books-catalog.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { ListBooksQueryDto } from './dto/list-books-query.dto';

@ApiBearerAuth()
@ApiTags('Manage Books')
@Controller('books')

export class BooksController {
  constructor(
    private readonly booksService: BooksService,
    private readonly catalogService: BooksCatalogService,
  ) {}
  @Post()
  @ApiOperation({ summary: 'Create a new book' })
  create(@Body() dto: CreateBookDto) {
    return this.booksService.create(dto);
  }
  @Get()
  @ApiOperation({ summary: 'Get list of books with filters and pagination' })
  findAll(@Query() query: ListBooksQueryDto) {
    return this.catalogService.list(query);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get a single book by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.booksService.findOne(String(id));
  }
  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing book' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBookDto) {
    return this.booksService.update(String(id), dto);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a book by ID' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.booksService.remove(String(id));
  }
}