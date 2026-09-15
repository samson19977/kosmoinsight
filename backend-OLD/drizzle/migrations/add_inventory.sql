-- Migration: add inventory management columns + stock_movements audit table
-- Run this against your Supabase database in the SQL editor if you already ran
-- the previous migration and the tables already exist.

-- 1. Add low_stock_threshold column to products (if not already present)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 10;

-- 2. Create stock_movements audit table
CREATE TABLE IF NOT EXISTS stock_movements (
  id               SERIAL PRIMARY KEY,
  product_id       INTEGER NOT NULL REFERENCES products(id),
  change_qty       INTEGER NOT NULL,
  reason           VARCHAR(100) NOT NULL,
  order_id         INTEGER REFERENCES orders(id),
  admin_id         INTEGER REFERENCES admins(id),
  note             TEXT,
  created_at       TIMESTAMP DEFAULT NOW()
);
