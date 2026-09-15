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
  // Only products flagged true here can be bought on a PayGo installment
  // plan (currently just Medium Package) — enforced server-side on every
  // order/loan path, not just hidden in the UI.
  installmentEligible: boolean('installment_eligible').default(false),
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
  // Full Rwanda administrative hierarchy: District > Sector > Cell > Village.
  // Required together whenever a customer takes a PayGo installment plan,
  // so a loan is always physically locatable for collections follow-up —
  // this is also the exact shape a USSD registration flow populates.
  district: varchar('district', { length: 100 }),
  sector: varchar('sector', { length: 100 }),
  cell: varchar('cell', { length: 100 }),
  village: varchar('village', { length: 100 }),
  // Stores the ENCRYPTED national ID (AES-256-GCM, see src/lib/fieldCrypto.ts)
  // — never the plaintext value. Widened from 20 to 255 chars to fit the
  // "<iv>:<authTag>:<ciphertext>" envelope. nationalIdHash is a
  // deterministic HMAC used for exact-match lookup, since the encrypted
  // value itself can't be searched or compared in SQL.
  nationalId: varchar('national_id', { length: 255 }),
  nationalIdHash: varchar('national_id_hash', { length: 64 }),
  // Which reseller/agent this customer belongs to, if any. An agent's own
  // customers earn that agent commission on every sale, regardless of
  // whether the sale itself happens through the agent or the storefront.
  agentId: integer('agent_id').references(() => agents.id),
  // Acquisition tracking — feeds CAC (cost) against LTV (sum of payments/installments).
  acquisitionChannel: varchar('acquisition_channel', { length: 50 }), // e.g. 'field-agent', 'school-partner', 'referral', 'walk-in'
  acquisitionCostRwf: integer('acquisition_cost_rwf'), // one-time cost to acquire this customer, entered manually by admin
  // Set when a customer record originates from a bulk spreadsheet import
  // rather than an order/USSD registration — lets admins tell the two apart.
  source: varchar('source', { length: 30 }).default('order'), // order | ussd | import | admin
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
  // Which reseller/agent facilitated this sale, if any — drives commission.
  agentId: integer('agent_id').references(() => agents.id),
  // Which sales channel created this order — web checkout vs. a USSD session
  // (no smartphone/internet needed) vs. an agent recording a sale on the
  // customer's behalf.
  channel: varchar('channel', { length: 20 }).default('web'), // web | ussd | agent
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
  // ---- Self-service MoMo payment tracking ----
  // Set when a customer initiates a Request-to-Pay against this installment;
  // cleared once the reconciliation poll or webhook resolves it (paid or failed).
  pendingMomoReferenceId: varchar('pending_momo_reference_id', { length: 100 }),
  pendingMomoAmountRwf: integer('pending_momo_amount_rwf'),
  pendingMomoPhone: varchar('pending_momo_phone', { length: 20 }),
  pendingMomoInitiatedAt: timestamp('pending_momo_initiated_at'),
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

// ============================================
// AGENTS TABLE (resellers)
// Kosmotive distributes stock to field resellers/agents, who sell it on
// (cash or MoMo) and earn a commission on each sale. A customer picking up
// from an agent is tracked under that agent, so both "who sold this" and
// "who does this customer belong to" are always answerable.
// ============================================
export const agents = pgTable('agents', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  // Reseller code as used in Kosmotive's existing spreadsheets (e.g.
  // BEN-BWALC4AA6EI) — kept as the stable external identifier so a bulk
  // import can upsert against it without creating duplicates. Agents who
  // self-register instead get an auto-generated code (KOS001, KOS002...).
  code: varchar('code', { length: 50 }).notNull().unique(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  email: varchar('email', { length: 100 }).unique(),
  passwordHash: varchar('password_hash', { length: 255 }), // null for spreadsheet-imported agents until they set one
  // Same encrypted-at-rest treatment as customers.nationalId — see
  // src/lib/fieldCrypto.ts and the comment on that field for why.
  nationalId: varchar('national_id', { length: 255 }),
  nationalIdHash: varchar('national_id_hash', { length: 64 }),
  district: varchar('district', { length: 100 }),
  sector: varchar('sector', { length: 100 }),
  cell: varchar('cell', { length: 100 }),
  village: varchar('village', { length: 100 }),
  region: varchar('region', { length: 50 }), // free-text province/region tag, e.g. "Eastern Province", "North", "Kigali"
  // Commission rate for this specific agent, in basis points (1500 = 15%).
  // Defaults to the platform-wide default (see `settings`) at creation time
  // but can be overridden per agent without affecting anyone else's rate.
  // Only an admin can change this — never the agent themselves.
  commissionRateBps: integer('commission_rate_bps').notNull().default(1500),
  // Lifecycle: pending (self-registered, awaiting review) -> approved ->
  // active (both can sell/log in) -> suspended -> rejected. A bulk-imported
  // or admin-created agent starts at 'active' directly, skipping review.
  status: varchar('status', { length: 20 }).notNull().default('active'), // pending | approved | active | suspended | rejected
  // Set when this agent record came from a bulk spreadsheet import rather
  // than self-registering or being created by hand in the dashboard.
  source: varchar('source', { length: 30 }).default('admin'), // admin | import | self
  notes: text('notes'),
  approvedAt: timestamp('approved_at'),
  approvedByAdminId: integer('approved_by_admin_id').references(() => admins.id),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================
// AGENT COMMISSIONS TABLE (append-only ledger)
// Deliberately an audit trail rather than a mutable running wallet balance
// (the same lesson learned from the PayGo loan design) — "how much is
// owed to this agent" is always SUM(commission_rwf) WHERE status='pending',
// computed on demand, never a single number that can drift out of sync.
// ============================================
export const agentCommissions = pgTable('agent_commissions', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => agents.id).notNull(),
  orderId: integer('order_id').references(() => orders.id),
  loanId: integer('loan_id').references(() => loans.id),
  saleAmountRwf: integer('sale_amount_rwf').notNull(), // the order/loan amount the commission was calculated against
  commissionRateBps: integer('commission_rate_bps').notNull(), // rate actually applied, frozen at the time of sale
  commissionRwf: integer('commission_rwf').notNull(),
  // For PayGo sales, commission accrues PER INSTALLMENT PAYMENT (see
  // LoanService.recordPayment) rather than as one lump sum — this traces
  // each accrual row back to the exact installment payment that produced
  // it. Null for one-time (non-PayGo) sales, which still get a single
  // commission row as before.
  installmentId: integer('installment_id').references(() => installments.id),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending | paid | reversed
  paidAt: timestamp('paid_at'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================
// LOAN AGREEMENTS TABLE
// One row per PayGo loan, recording that the customer explicitly reviewed
// and accepted the financing terms (total, down payment, financed amount,
// term, schedule) before the loan was opened. The frontend checkbox is
// just UI — this table is what actually makes the acceptance provable
// after the fact, per-loan, with who facilitated the sale and when.
// ============================================
export const loanAgreements = pgTable('loan_agreements', {
  id: serial('id').primaryKey(),
  loanId: integer('loan_id').references(() => loans.id).notNull().unique(),
  orderId: integer('order_id').references(() => orders.id),
  customerId: integer('customer_id').references(() => customers.id).notNull(),
  agentId: integer('agent_id').references(() => agents.id), // null when opened directly by admin, not through an agent sale
  termsVersion: varchar('terms_version', { length: 20 }).notNull().default('v1'),
  acceptedAt: timestamp('accepted_at').defaultNow().notNull(),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================
// ADMIN AUDIT LOG TABLE
// Generic append-only trail of sensitive admin actions (agent approval/
// suspension/rejection/password reset/commission-rate changes, etc.) —
// "who did what to which record, and when" for anything that isn't
// already covered by a domain-specific ledger (loan_transactions,
// stock_movements).
// ============================================
export const adminAuditLog = pgTable('admin_audit_log', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id').references(() => admins.id),
  action: varchar('action', { length: 60 }).notNull(), // e.g. 'agent.approve', 'agent.suspend', 'agent.reset_password'
  targetType: varchar('target_type', { length: 30 }).notNull(), // 'agent' | 'commission' | ...
  targetId: integer('target_id').notNull(),
  details: text('details'), // free-text/JSON-stringified context, e.g. { reason }
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================
// LEDGER ENTRIES TABLE
// A single, append-only, never-edited-or-deleted log of every event that
// moves money in or out of a tracked account — the one place you can go
// to answer "show me everything that happened to this money" without
// cross-referencing five different tables.
//
// This is a PRAGMATIC single-entry ledger, not full double-entry
// bookkeeping: each row records one signed amount against one account,
// rather than a matching debit+credit pair across two accounts. That's a
// deliberate scope choice — it's a large jump in complexity to build (and
// to keep correct) a real chart-of-accounts double-entry system, and this
// already delivers the thing that actually matters day to day: a
// complete, filterable, exportable, immutable history per account,
// reconcilable against orders/loans/commissions. Worth revisiting as a
// dedicated project if Kosmotive ever needs formal double-entry
// accounting (e.g. for an external audit or investor due diligence).
//
// accountType + accountId identify WHOSE balance this affects:
//   - accountType='business', accountId=null   → Kosmotive's own cash position
//   - accountType='agent',    accountId=<id>   → what Kosmotive owes that agent
// amountRwf is signed: positive = increases the account's balance,
// negative = decreases it. An account's current balance is always
// SUM(amountRwf) over its rows — never stored redundantly, so it can
// never drift out of sync with the entries that produced it.
// ============================================
export const ledgerEntries = pgTable('ledger_entries', {
  id: serial('id').primaryKey(),
  accountType: varchar('account_type', { length: 20 }).notNull(), // 'business' | 'agent'
  accountId: integer('account_id'), // agent id when accountType='agent'; null for 'business'
  amountRwf: integer('amount_rwf').notNull(), // signed: + = credit/increase, - = debit/decrease
  category: varchar('category', { length: 40 }).notNull(), // 'order_payment' | 'refund' | 'commission_accrued' | 'commission_paid' | 'loan_repayment' | 'manual_adjustment'
  referenceType: varchar('reference_type', { length: 30 }), // 'order' | 'agent_commission' | 'installment' | ...
  referenceId: integer('reference_id'),
  description: text('description').notNull(),
  createdByAdminId: integer('created_by_admin_id').references(() => admins.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================
// SETTINGS TABLE (simple key/value store)
// Platform-wide configuration an admin can change without a code deploy —
// currently just the default agent commission rate, but deliberately
// generic so more knobs can be added the same way later.
// ============================================
export const settings = pgTable('settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================
// RWANDA ADMINISTRATIVE HIERARCHY (reference data — read-only lookups)
// Province → District → Sector → Cell → Village. This is what powers the
// cascading location dropdowns everywhere a customer/agent address is
// entered, replacing free-text district/sector/cell/village fields that
// let anyone type anything (misspellings, made-up places, inconsistent
// naming across records — all a real problem for KYC/PayGo, where an
// address is part of verifying who someone actually is).
//
// DELIBERATE DESIGN CHOICE: these tables are reference-only. The existing
// customers.district/sector/cell/village and agents.district/sector/cell/
// village columns stay exactly as they are (free-text varchar) — a
// selection here just fills in the resolved official name into those
// same fields. This gets you validated, consistent, cascading selection
// without a breaking schema change across every place that already reads
// those columns as plain strings.
//
// DATA SOURCE: seeded from a real, complete Rwanda administrative dataset
// (5 provinces, 30 districts, 416 sectors, 2,149 cells, 14,837 villages)
// — see src/db/seedLocations.ts and backend/data/rwanda-locations.json.
// ============================================
export const rwDistricts = pgTable('rw_districts', {
  id: serial('id').primaryKey(),
  province: varchar('province', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }).notNull().unique(),
});

export const rwSectors = pgTable('rw_sectors', {
  id: serial('id').primaryKey(),
  districtId: integer('district_id').references(() => rwDistricts.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
});

export const rwCells = pgTable('rw_cells', {
  id: serial('id').primaryKey(),
  sectorId: integer('sector_id').references(() => rwSectors.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
});

export const rwVillages = pgTable('rw_villages', {
  id: serial('id').primaryKey(),
  cellId: integer('cell_id').references(() => rwCells.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
});

