## Project setup

```bash
$ npm install
```

## Run with Docker Compose

The root `.env` contains the PostgreSQL and API configuration used by Compose. It
is ignored by Git; use `.env.example` as a safe template when creating another
environment.

```bash
docker compose up --build
```

This starts the API at `http://localhost:3000` and PostgreSQL at `localhost:5432`.
The API waits for PostgreSQL's health check before starting. To stop the stack,
run `docker compose down`; append `-v` only when you also want to remove the
database volume. On a fresh database volume, `scripts/init.sql` creates the
schema and adds sample categories and products. PostgreSQL init scripts only
run for an empty data directory; use `docker compose down -v` before starting
again if you intentionally want to recreate local sample data.

Product listing prices are calculated live from the active direct or category
promotion, falling back to the product `base_price` when no promotion is active.
For an existing database volume that previously created the materialized view,
remove it once with:

```bash
docker compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/maintenance/drop-product-listings-view.sql'
```

## List products

`GET /products` calculates effective prices live and uses page-based pagination.
It accepts an optional `categoryId`, `page` (default `1`), `size` (default `20`,
maximum `100`), and `sortOrder` (`asc` by default, or `desc`), and always sorts
by effective price. The response includes the total number of matching products
and pages.

```text
GET /products?categoryId=CATEGORY_UUID&page=1&size=20&sort=effectivePrice&sortOrder=asc
```

## Promotion endpoints

Create a promotion and assign it to exactly one product or category:

```bash
curl -X POST http://localhost:3000/promotions \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Spring sale",
    "discountType": "percentage",
    "value": 15,
    "startDate": "2026-03-01T00:00:00.000Z",
    "endDate": "2026-03-31T23:59:59.000Z",
    "productId": "PRODUCT_UUID"
  }'
```

Reassign an existing promotion with `PATCH /promotions/:id/assignment`, passing
either `productId` or `categoryId`, and cancel it with
`PATCH /promotions/:id/cancel`. Overlapping active windows are rejected with
`409 Conflict`, including conflicts between a product promotion and a promotion
that applies to its category. Cancelling unassigns the promotion from both its
product and category.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Generate sample data

```
node ./scripts/generateSampleData.cjs
```

## Send sample data

```
curl -X POST http://localhost:3000/products \
-F "file=@./scripts/generated_sample_data.csv"
```

## Notes

- We do not clear the files after the process. We would probably want them to be kept, ideally in a s3 bucket or similar.
- Another efficient processing for product import can be achieved via RabbitMQ and multiple consumers. Current implementation uses distrubuted lock for handling concurrency issues. It is safe to use multiple instances of the api.
