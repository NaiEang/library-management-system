import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags, ApiOperation } from '@nestjs/swagger';
import { BookCopiesService } from './book-copies.service';
import { CreateBookCopiesDto } from './dto/create-book-copies.dto';
import { UpdateBookCopyDto } from './dto/update-book-copy.dto';

@ApiBearerAuth()

@ApiTags('Book Copies')

@Controller()
export class BookCopiesController {
  constructor(private readonly copiesService: BookCopiesService) {}

  @Post('books/:bookId/copies')
  @ApiOperation({ summary: 'Create physical copies for a specific book' })
  create(@Param('bookId', ParseIntPipe) bookId: number, @Body() dto: CreateBookCopiesDto) {
    return this.copiesService.createForBook(String(bookId), dto);
  }

  @Get('books/:bookId/copies')
  @ApiOperation({ summary: 'List physical copies of a specific book with optional status filter' })
  @ApiQuery({ name: 'status', required: false })
  list(@Param('bookId', ParseIntPipe) bookId: number, @Query('status') status?: string) {
    return this.copiesService.listForBook(String(bookId), status);
  }

  @Get('book-copies/by-code/:copyCode')
  @ApiOperation({ summary: 'Find a book copy by its unique copy code barcode' })
  findByCode(@Param('copyCode') copyCode: string) {
    return this.copiesService.findByCode(copyCode);
  }

  @Get('book-copies/:id')
  @ApiOperation({ summary: 'Get a single book copy by its ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.copiesService.findOne(String(id));
  }

  @Patch('book-copies/:id')
  @ApiOperation({ summary: 'Update an existing book copy' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBookCopyDto) {
    return this.copiesService.update(String(id), dto);
  }
  
  @Delete('book-copies/:id')
  @ApiOperation({ summary: 'Delete a book copy by ID' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.copiesService.remove(String(id));
  }
}