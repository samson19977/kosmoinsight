import { pgTable, serial, varchar, text, integer, boolean, timestamp, numeric } from 'drizzle-orm/pg-core';

// ============================================
// ENUMS (kept as varchar to avoid enum migration issues)
// ============================================

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
  lowStockThreshold: integer('low_stock_threshold').default(10),
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
  acquisitionChannel: varchar('acquisition_channel', { length: 50 }), // e.g. 'field-agent', 'referral', 'school-partnership'
  acquisitionCostRwf: integer('acquisition_cost_rwf'), // cost to acquire this customer, for CAC calculations
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

// ============================================
// STOCK MOVEMENTS TABLE (audit trail for inventory changes)
// ============================================
export const stockMovements = pgTable('stock_movements', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.id).notNull(),
  changeQty: integer('change_qty').notNull(), // positive = restock, negative = sale/adjustment
  reason: varchar('reason', { length: 100 }).notNull(), // 'sale', 'restock', 'adjustment', 'correction'
  orderId: integer('order_id').references(() => orders.id),
  adminId: integer('admin_id').references(() => admins.id),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================
// LOANS TABLE (PayGo installment plans)
// One row per installment plan, linked back to the order that created it.
// This is the queryable "loan state" a raw wallet-ledger export doesn't give you.
// ============================================
export const loans = pgTable('loans', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  customerId: integer('customer_id').references(() => customers.id).notNull(),
  principalRwf: integer('principal_rwf').notNull(), // financed amount (total - down payment)
  downPaymentRwf: integer('down_payment_rwf').notNull().default(0),
  interestRateBps: integer('interest_rate_bps').notNull().default(0), // basis points, e.g. 1500 = 15%
  termMonths: integer('term_months').notNull(),
  status: varchar('status', { length: 30 }).notNull().default('active'), // active | completed | defaulted | cancelled
  guarantorName: varchar('guarantor_name', { length: 100 }), // school/NGO/co-signer, optional
  guarantorPhone: varchar('guarantor_phone', { length: 20 }),
  acquisitionChannel: varchar('acquisition_channel', { length: 50 }), // for CAC/LTV attribution
  startDate: timestamp('start_date').defaultNow(),
  expectedPayoffDate: timestamp('expected_payoff_date'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================
// INSTALLMENTS TABLE
// One row per scheduled payment on a loan. Repayment rate is a direct
// query against this table (SUM(amount_paid_rwf) / SUM(amount_due_rwf)),
// no ledger reconstruction needed.
// ============================================
export const installments = pgTable('installments', {
  id: serial('id').primaryKey(),
  loanId: integer('loan_id').references(() => loans.id).notNull(),
  installmentNumber: integer('installment_number').notNull(), // 1-indexed
  dueDate: timestamp('due_date').notNull(),
  amountDueRwf: integer('amount_due_rwf').notNull(),
  amountPaidRwf: integer('amount_paid_rwf').notNull().default(0),
  penaltyRwf: integer('penalty_rwf').notNull().default(0),
  status: varchar('status', { length: 30 }).notNull().default('upcoming'), // upcoming | due | paid | overdue | waived
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================
// LOAN TRANSACTIONS TABLE (audit trail)
// Keeps the ledger idea from a wallet-style export, but scoped to a loan
// instead of a free-floating customer wallet.
// ============================================
export const loanTransactions = pgTable('loan_transactions', {
  id: serial('id').primaryKey(),
  loanId: integer('loan_id').references(() => loans.id).notNull(),
  installmentId: integer('installment_id').references(() => installments.id),
  type: varchar('type', { length: 30 }).notNull(), // disbursement | payment | penalty | waiver
  amountRwf: integer('amount_rwf').notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }), // momo | cash | bank
  momoTransactionId: varchar('momo_transaction_id', { length: 100 }),
  // 'completed' for immediate entries (cash/bank/manual, or a settled momo push).
  // 'pending' while a MoMo request-to-pay is awaiting customer approval —
  // the reconciliation job flips this to 'completed'/'failed' automatically.
  status: varchar('status', { length: 20 }).notNull().default('completed'),
  adminId: integer('admin_id').references(() => admins.id), // set when an admin recorded it manually
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow(),
});
