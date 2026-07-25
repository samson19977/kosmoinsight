import { pgTable, serial, varchar, text, integer, boolean, timestamp, numeric, pgEnum } from 'drizzle-orm/pg-core';

// ============================================
// ENUMS
// ============================================
export const orderStatusEnum = pgEnum('order_status', ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'paid', 'failed', 'refunded']);
export const paymentMethodEnum = pgEnum('payment_method', ['momo', 'cash', 'bank']);

// ============================================
// PRODUCTS TABLE
// ============================================
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  priceRwf: integer('price_rwf').notNull(),
  packageType: varchar('package_type', { length: 50 }).notNull(),
  imageUrl: varchar('image_url', { length: 255 }),
  stock: integer('stock').default(9999),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================
// CUSTOMERS TABLE
// ============================================
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  firstName: varchar('first_name', { length: 50 }).notNull(),
  lastName: varchar('last_name', { length: 50 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  email: varchar('email', { length: 100 }),
  district: varchar('district', { length: 100 }),
  village: varchar('village', { length: 100 }),
  nationalId: varchar('national_id', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================
// ORDERS TABLE
// ============================================
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: varchar('order_number', { length: 50 }).notNull().unique(),
  customerId: integer('customer_id').references(() => customers.id),
  customerName: varchar('customer_name', { length: 100 }).notNull(),
  customerEmail: varchar('customer_email', { length: 100 }),
  customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
  totalRwf: integer('total_rwf').notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(),
  orderStatus: varchar('order_status', { length: 30 }).default('pending'),
  paymentStatus: varchar('payment_status', { length: 30 }).default('pending'),
  momoReference: varchar('momo_reference', { length: 100 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================
// ORDER ITEMS TABLE
// ============================================
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  productId: integer('product_id').references(() => products.id),
  productName: varchar('product_name', { length: 100 }).notNull(),
  quantity: integer('quantity').notNull(),
  priceRwf: integer('price_rwf').notNull(),
  subtotalRwf: integer('subtotal_rwf').notNull(),
});

// ============================================
// PAYMENTS TABLE
// ============================================
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  orderNumber: varchar('order_number', { length: 50 }).notNull(),
  amountRwf: integer('amount_rwf').notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  momoTransactionId: varchar('momo_transaction_id', { length: 100 }),
  momoReference: varchar('momo_reference', { length: 100 }),
  status: varchar('status', { length: 30 }).default('pending'),
  notes: text('notes'),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================
// ADMINS TABLE (dashboard / back-office login)
// ============================================
export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 100 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 30 }).default('admin'), // admin | superadmin
  isActive: boolean('is_active').default(true),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
