import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { BooksService } from './books.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { AuthenticatedUser } from 'nest-keycloak-connect';
import { KeycloakUserInstance } from './interfaces/keycloak-user.interface';

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get()
  async findAll(@AuthenticatedUser() user: KeycloakUserInstance) {
    return this.booksService.findAll(user.sub);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const book = await this.booksService.findOne(id);
      return book;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  @Post()
  async create(
    @Body() createBookDto: CreateBookDto,
    @AuthenticatedUser() user: KeycloakUserInstance,
  ) {
    try {
      const newBook = await this.booksService.create(createBookDto, user.sub);
      return {
        message: 'Book created successfully',
        book: newBook,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to create book',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateBookDto: UpdateBookDto,
    @AuthenticatedUser() user: KeycloakUserInstance,
  ) {
    try {
      const updatedBook = await this.booksService.update(
        id,
        updateBookDto,
        user.sub,
      );
      return {
        message: 'Book updated successfully',
        book: updatedBook,
      };
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        'Failed to update book',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @AuthenticatedUser() user: KeycloakUserInstance,
  ) {
    try {
      await this.booksService.remove(id, user.sub);
      return {
        message: 'Book deleted successfully',
      };
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        'Failed to delete book',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
