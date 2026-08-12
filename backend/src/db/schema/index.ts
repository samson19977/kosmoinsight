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
  // Acquisition tracking — feeds CAC (cost) against LTV (sum of payments/installments).
  acquisitionChannel: varchar('acquisition_channel', { length: 50 }), // e.g. 'field-agent', 'school-partner', 'referral', 'walk-in'
  acquisitionCostRwf: integer('acquisition_cost_rwf'), // one-time cost to acquire this customer, entered manually by admin
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
// LOANS TABLE (PayGo installment plans)
// One row per installment plan taken out against an order — replaces the
// free-floating wallet model (Terra/WaaS) with a queryable loan state, so
// repayment rate is a direct aggregate over `installments` instead of a
// ledger reconstruction.
// ============================================
export const loans = pgTable('loans', {
  id: serial('id').primaryKey(),
  loanNumber: varchar('loan_number', { length: 50 }).notNull().unique(),
  orderId: integer('order_id').references(() => orders.id),
  customerId: integer('customer_id').references(() => customers.id).notNull(),
  principalRwf: integer('principal_rwf').notNull(), // total price financed (excludes down payment)
  downPaymentRwf: integer('down_payment_rwf').default(0),
  interestRateBps: integer('interest_rate_bps').default(0), // basis points, flat rate over the term (e.g. 500 = 5%)
  termMonths: integer('term_months').notNull(),
  totalPayableRwf: integer('total_payable_rwf').notNull(), // principal + interest, what installments sum to
  status: varchar('status', { length: 20 }).default('active'), // active | completed | defaulted | cancelled
  guarantorType: varchar('guarantor_type', { length: 20 }).default('none'), // none | school | ngo | individual
  guarantorName: varchar('guarantor_name', { length: 100 }),
  guarantorPhone: varchar('guarantor_phone', { length: 20 }),
  disbursedAt: timestamp('disbursed_at').defaultNow(),
  expectedPayoffDate: timestamp('expected_payoff_date'),
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================
// INSTALLMENTS TABLE
// One row per scheduled payment on a loan. Repayment rate for any slice
// (a loan, a district, a cohort, all-time) is:
//   SUM(amount_paid_rwf) / SUM(amount_due_rwf)
// computed directly from this table — no ledger walk required.
// ============================================
export const installments = pgTable('installments', {
  id: serial('id').primaryKey(),
  loanId: integer('loan_id').references(() => loans.id).notNull(),
  installmentNumber: integer('installment_number').notNull(), // 1-indexed position in the schedule
  dueDate: timestamp('due_date').notNull(),
  amountDueRwf: integer('amount_due_rwf').notNull(),
  amountPaidRwf: integer('amount_paid_rwf').default(0),
  penaltyRwf: integer('penalty_rwf').default(0), // accrued late-payment penalty, tracked separately from principal/interest
  status: varchar('status', { length: 20 }).default('upcoming'), // upcoming | due | paid | partial | overdue
  paidAt: timestamp('paid_at'),
  reminderSentAt: timestamp('reminder_sent_at'), // gates the pre-due-date reminder email so it only fires once
  overdueAlertSentAt: timestamp('overdue_alert_sent_at'), // gates the overdue email so it only fires once
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================
// LOAN TRANSACTIONS TABLE (audit trail)
// Keeps the ledger idea Terra used, but scoped to a loan instead of a
// free-floating wallet, so every entry ties back to a queryable loan/installment.
// ============================================
export const loanTransactions = pgTable('loan_transactions', {
  id: serial('id').primaryKey(),
  loanId: integer('loan_id').references(() => loans.id).notNull(),
  installmentId: integer('installment_id').references(() => installments.id),
  type: varchar('type', { length: 20 }).notNull(), // disbursement | payment | penalty | waiver
  amountRwf: integer('amount_rwf').notNull(),
  method: varchar('method', { length: 30 }), // momo | cash | bank | agent
  phone: varchar('phone', { length: 20 }),
  momoTransactionId: varchar('momo_transaction_id', { length: 100 }),
  adminId: integer('admin_id').references(() => admins.id),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow(),
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
