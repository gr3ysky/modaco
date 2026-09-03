import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Post,
  Query,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ListProductsQueryDto } from '../dto/list-products-query.dto.js';
import { ProductEntity } from '../entities/product.entity.js';
import {
  ProductListingPage,
  ProductsService,
} from '../services/products.service.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { FileImportService } from '../services/fileImport.service.js';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly fileImportService: FileImportService,
  ) {}

  @Get()
  findAll(@Query() query: ListProductsQueryDto): Promise<ProductListingPage> {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<ProductEntity> {
    return this.productsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        // Compose mounts this path in production; a writable temp directory
        // keeps the API usable by local and E2E test processes as well.
        destination:
          process.env.UPLOAD_DIRECTORY ?? join('/tmp', 'modaco-uploads'),
        filename: (req, file, callback) => {
          // Generate a unique filename: timestamp-random.ext
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  async uploadFile(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 50 * 1024 * 1024 }) // Limit file size to 50MB
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: Express.Multer.File,
  ) {
    if (
      await this.fileImportService.trySendFileToQueue(file.filename, file.path)
    ) {
      return {
        message: 'File saved successfully!',
        filename: file.filename,
        savedPath: file.path,
        sizeBytes: file.size,
      };
    }
    throw new UnprocessableEntityException('Failed to upload the file');
  }
}
