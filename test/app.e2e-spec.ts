import {
  BadRequestException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PromotionsController } from '../src/products/controllers/promotions.controller.js';
import { ProductsController } from '../src/products/controllers/products.controller.js';
import { ProductImportService } from '../src/products/services/productImport.service.js';
import { ProductsService } from '../src/products/services/products.service.js';
import { PromotionsService } from '../src/products/services/promotions.service.js';

const categoryId = 'c14e20ee-2079-4c90-a501-7adf72e6f632';
const productId = '1f0bfbd7-04c7-4bbd-9da0-57f2d1c24ad9';
const promotionId = '52acb7a0-a24e-40cf-8eaa-6d506812e1c0';

describe('API endpoints (e2e)', () => {
  let app: INestApplication<App>;
  const productsService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
  };
  const promotionsService = {
    create: vi.fn(),
    assign: vi.fn(),
    cancel: vi.fn(),
  };
  const productImportService = {
    createProductImport: vi.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController, PromotionsController],
      providers: [
        { provide: ProductsService, useValue: productsService },
        { provide: PromotionsService, useValue: promotionsService },
        { provide: ProductImportService, useValue: productImportService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /products returns a paginated product listing', async () => {
    const listing = {
      productId,
      name: 'Keyboard',
      sku: 'KEY-001',
      categoryId,
      categoryName: 'Electronics',
      basePrice: '129.99',
      stockQuantity: 42,
      activePromotionId: null,
      activeDiscountType: null,
      activeDiscountValue: null,
      effectivePrice: '129.99',
    };
    productsService.findAll.mockResolvedValue({
      data: [listing],
      pagination: {
        page: 2,
        size: 10,
        total: 11,
        totalPages: 2,
        sortOrder: 'desc',
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/products?categoryId=${categoryId}&page=2&size=10&sortOrder=desc`)
      .expect(200);

    expect(response.body).toEqual({
      data: [listing],
      pagination: {
        page: 2,
        size: 10,
        total: 11,
        totalPages: 2,
        sortOrder: 'desc',
      },
    });
    expect(productsService.findAll).toHaveBeenCalledWith({
      categoryId,
      page: 2,
      size: 10,
      sortOrder: 'desc',
    });
  });

  it('GET /products/:id returns a product', async () => {
    productsService.findOne.mockResolvedValue({
      id: productId,
      name: 'Keyboard',
      sku: 'KEY-001',
      basePrice: '129.99',
      stockQuantity: 42,
    });

    const response = await request(app.getHttpServer())
      .get(`/products/${productId}`)
      .expect(200);

    expect(response.body).toMatchObject({ id: productId, sku: 'KEY-001' });
    expect(productsService.findOne).toHaveBeenCalledWith(productId);
  });

  it('rejects invalid and missing products', async () => {
    await request(app.getHttpServer()).get('/products/not-a-uuid').expect(400);

    productsService.findOne.mockRejectedValue(
      new NotFoundException(`Product with ID ${productId} was not found`),
    );
    await request(app.getHttpServer()).get(`/products/${productId}`).expect(404);
  });

  it('POST /products accepts a CSV upload and creates an import job', async () => {
    productImportService.createProductImport.mockResolvedValue({ id: 'import-id' });

    const response = await request(app.getHttpServer())
      .post('/products')
      .attach(
        'file',
        Buffer.from(
          'name,sku,basePrice,stockQuantity,category\nKeyboard,KEY-001,129.99,42,Electronics\n',
        ),
        { filename: 'products.csv', contentType: 'text/csv' },
      )
      .expect(202);

    expect(response.body).toMatchObject({
      message: 'File saved successfully!',
      sizeBytes: expect.any(Number),
    });
    expect(response.body.filename).toMatch(/^file-\d+-\d+\.csv$/);
    expect(productImportService.createProductImport).toHaveBeenCalledWith(
      response.body.savedPath,
    );
  });

  it('POST /products rejects a request without a file', async () => {
    await request(app.getHttpServer()).post('/products').expect(422);
  });

  it('POST /promotions creates a promotion', async () => {
    const input = {
      name: 'Spring sale',
      discountType: 'percentage',
      value: 15,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-31T23:59:59.000Z',
      productId,
    };
    promotionsService.create.mockResolvedValue({ id: promotionId, ...input });

    const response = await request(app.getHttpServer())
      .post('/promotions')
      .send(input)
      .expect(201);

    expect(response.body).toMatchObject({ id: promotionId, name: input.name });
    expect(promotionsService.create).toHaveBeenCalledWith(input);
  });

  it('PATCH /promotions/:id/assignment reassigns a promotion', async () => {
    const assignment = { categoryId };
    promotionsService.assign.mockResolvedValue({
      id: promotionId,
      category: { id: categoryId },
    });

    const response = await request(app.getHttpServer())
      .patch(`/promotions/${promotionId}/assignment`)
      .send(assignment)
      .expect(200);

    expect(response.body).toMatchObject({
      id: promotionId,
      category: { id: categoryId },
    });
    expect(promotionsService.assign).toHaveBeenCalledWith(promotionId, assignment);
  });

  it('PATCH /promotions/:id/cancel cancels a promotion', async () => {
    promotionsService.cancel.mockResolvedValue({
      id: promotionId,
      product: null,
      category: null,
    });

    const response = await request(app.getHttpServer())
      .patch(`/promotions/${promotionId}/cancel`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: promotionId,
      product: null,
      category: null,
    });
    expect(promotionsService.cancel).toHaveBeenCalledWith(promotionId);
  });

  it('returns API errors from promotion endpoints and rejects invalid IDs', async () => {
    promotionsService.create.mockRejectedValue(
      new BadRequestException('Promotion value must be greater than zero'),
    );
    await request(app.getHttpServer())
      .post('/promotions')
      .send({ value: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/promotions/not-a-uuid/cancel')
      .expect(400);
  });
});
