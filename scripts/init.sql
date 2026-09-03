-- This file runs once when PostgreSQL initializes an empty data directory.
-- It mirrors the current TypeORM entity schema and adds local development data.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  CREATE TYPE promotion_discount_type_enum AS ENUM ('percentage', 'fixed_amount');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE file_process_status_enum AS ENUM ('created', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


create table if not exists product_imports (
  id uuid primary key default uuid_generate_v4(),
  file_name varchar(255) not null UNIQUE,
  file_path varchar(1023) not null,
  status file_process_status_enum not null default 'created',
  created_at timestamptz not null default now(),
  process_started_at timestamptz  null,
  process_completed_at timestamptz  null
);


CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(120) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(255) NOT NULL,
  sku varchar(100) NOT NULL UNIQUE,
  base_price numeric(12, 2) NOT NULL,
  stock_quantity integer NOT NULL DEFAULT 0,
  category_id uuid NOT NULL REFERENCES product_categories(id) ON DELETE RESTRICT,
  CONSTRAINT products_base_price_non_negative CHECK (base_price >= 0),
  CONSTRAINT products_stock_quantity_non_negative CHECK (stock_quantity >= 0)
);
CREATE INDEX IF NOT EXISTS "IDX_products_category_base_price"
  ON products (category_id, base_price, id);

CREATE TABLE IF NOT EXISTS promotions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(255) NOT NULL,
  discount_type promotion_discount_type_enum NOT NULL,
  value numeric(12, 2) NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  category_id uuid REFERENCES product_categories(id) ON DELETE CASCADE,
  CONSTRAINT promotions_value_non_negative CHECK (value >= 0),
  CONSTRAINT promotions_valid_date_range CHECK (start_date < end_date),
  CONSTRAINT promotions_at_most_one_target CHECK (
    NOT (product_id IS NOT NULL AND category_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "IDX_promotions_product_active_window"
  ON promotions (product_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS "IDX_promotions_category_active_window"
  ON promotions (category_id, start_date, end_date);

INSERT INTO product_categories (name)
VALUES
  ('Electronics'),
  ('Home & Kitchen'),
  ('Office Supplies')
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (name, sku, base_price, stock_quantity, category_id)
SELECT product.name, product.sku, product.base_price, product.stock_quantity, category.id
FROM (
  VALUES
    ('Wireless Mechanical Keyboard', 'ELEC-KEYBOARD-001', 129.99::numeric, 42),
    ('Stainless Steel Water Bottle', 'HOME-BOTTLE-001', 24.50::numeric, 85),
    ('Ergonomic Desk Chair', 'OFFICE-CHAIR-001', 249.00::numeric, 18),
    ('Noise Cancelling Headphones', 'ELEC-HEADPHONES-001', 199.99::numeric, 27)
) AS product(name, sku, base_price, stock_quantity)
JOIN product_categories AS category ON category.name = CASE
  WHEN product.sku LIKE 'ELEC-%' THEN 'Electronics'
  WHEN product.sku LIKE 'HOME-%' THEN 'Home & Kitchen'
  WHEN product.sku LIKE 'OFFICE-%' THEN 'Office Supplies'
END
ON CONFLICT (sku) DO NOTHING;
