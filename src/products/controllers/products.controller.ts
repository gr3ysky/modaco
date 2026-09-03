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
import { extname } from 'path';
import { ProductImportService } from '../services/productImport.service.js';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productImportService: ProductImportService,
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
        // Target directory where your Docker volume is mounted
        destination: '/app/data',
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
    await this.productImportService.createProductImport(file.path);
    return {
      message: 'File saved successfully!',
      filename: file.filename,
      savedPath: file.path,
      sizeBytes: file.size,
    };
  }
}
