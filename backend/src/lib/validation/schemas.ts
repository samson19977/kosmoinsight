import { z } from 'zod';

// ============================================
// CUSTOMER SCHEMA
// ============================================
export const customerSchema = z.object({
  firstName: z.string()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be less than 50 characters')
    .regex(/^[A-Za-z\s\-]+$/, 'First name must contain only letters, spaces, or hyphens'),

  lastName: z.string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must be less than 50 characters')
    .regex(/^[A-Za-z\s\-]+$/, 'Last name must contain only letters, spaces, or hyphens'),

  phone: z.string()
    .regex(/^(\+250|0)[78][0-9]{8}$/, 'Phone number must be a valid Rwandan number (e.g. 0788123456 or +250788123456)'),

  email: z.string()
    .email('Invalid email address')
    .optional()
    .or(z.literal('')),

  nationalId: z.string()
    .regex(/^[0-9]{16}$/, 'National ID must be 16 digits')
    .optional()
    .or(z.literal('')),

  district: z.string()
    .min(2, 'District is required')
    .optional()
    .or(z.literal('')),

  sector: z.string()
    .min(2, 'Sector is required')
    .optional()
    .or(z.literal('')),

  cell: z.string()
    .min(2, 'Cell is required')
    .optional()
    .or(z.literal('')),

  village: z.string()
    .min(2, 'Village is required')
    .optional()
    .or(z.literal('')),
});

// ============================================
// ORDER ITEM SCHEMA
// ============================================
export const orderItemSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  quantity: z.number()
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(100, 'Maximum quantity is 100'),
  price: z.number()
    .int('Price must be a whole number')
    .min(100, 'Price must be at least 100 RWF'),
  productId: z.number().positive().optional(),
});

// ============================================
// INSTALLMENT PLAN SCHEMA (embedded in an order when paying via PayGo)
// ============================================
export const orderInstallmentPlanSchema = z.object({
  downPaymentRwf: z.number()
    .int('Down payment must be a whole number')
    .min(0, 'Down payment cannot be negative'),
  termMonths: z.number()
    .int('Term must be a whole number of months')
    .min(1, 'Term must be at least 1 month')
    .max(24, 'Term must be at most 24 months'),
  interestRateBps: z.number()
    .int('Interest rate must be a whole number of basis points')
    .min(0)
    .max(5000)
    .default(0),
  guarantorName: z.string().max(100).optional().or(z.literal('')),
  guarantorPhone: z.string()
    .regex(/^(\+250|0)[78][0-9]{8}$/, 'Guarantor phone must be a valid Rwandan number')
    .optional()
    .or(z.literal('')),
});

// ============================================
// ORDER SCHEMA
// Cross-field rule: choosing "PayGo Installments" pulls in real repayment
// obligations, so it requires the identity and location fields a straight
// cash/MoMo sale doesn't — National ID for who's on the hook, and full
// District/Sector/Cell/Village so the loan is actually collectible.
// (Product-level installment eligibility — e.g. only Medium Package — is
// checked in the route itself, since it needs a database lookup.)
// ============================================
export const orderSchema = z.object({
  customer: customerSchema,
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  paymentMethod: z.enum([
    'Mobile Money (MTN / Airtel)',
    'Cash on Delivery',
    'Bank Transfer',
    'PayGo Installments',
  ]),
  installmentPlan: orderInstallmentPlanSchema.optional(),
  // Reseller/agent code, e.g. shared via a personal link or entered by the
  // agent when recording a sale on a customer's behalf. Optional — most
  // storefront orders have none.
  agentCode: z.string().max(50).optional().or(z.literal('')),
  channel: z.enum(['web', 'ussd', 'agent']).default('web'),
  notes: z.string().max(500, 'Notes must be less than 500 characters').optional(),
}).superRefine((data, ctx) => {
  if (data.paymentMethod !== 'PayGo Installments') return;

  if (!data.installmentPlan) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['installmentPlan'], message: 'Installment plan (down payment + term) is required for PayGo Installments' });
  }
  if (!data.customer.nationalId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customer', 'nationalId'], message: 'National ID (16 digits) is required to open a PayGo installment plan' });
  }
  if (!data.customer.district) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customer', 'district'], message: 'District is required for PayGo Installments' });
  }
  if (!data.customer.sector) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customer', 'sector'], message: 'Sector is required for PayGo Installments' });
  }
  if (!data.customer.cell) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customer', 'cell'], message: 'Cell is required for PayGo Installments' });
  }
  if (!data.customer.village) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customer', 'village'], message: 'Village is required for PayGo Installments' });
  }
});

// ============================================
// TOKEN SCHEMA (PAYG)
// ============================================
export const tokenSchema = z.object({
  customerId: z.number().positive('Customer ID is required'),
  productId: z.number().positive('Product ID is required'),
  quantity: z.number()
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(100, 'Maximum quantity is 100'),
  priceRwf: z.number()
    .int('Price must be a whole number')
    .min(100, 'Price must be at least 100 RWF'),
});

// ============================================
// PAYMENT SCHEMA
// ============================================
export const paymentSchema = z.object({
  tokenCode: z.string()
    .regex(/^KOS-\d{4}-[A-Z0-9]{6}$/, 'Invalid token format')
    .optional(),
  orderNumber: z.string().optional(),
  amountRwf: z.number()
    .int('Amount must be a whole number')
    .positive('Amount must be greater than 0'),
  paymentMethod: z.enum(['momo', 'cash', 'bank']),
  phone: z.string()
    .regex(/^(\+250|0)[78][0-9]{8}$/, 'Phone number must be a valid Rwandan number')
    .optional(),
});

// ============================================
// MOMO PAYMENT SCHEMA
// ============================================
export const momoPaymentSchema = z.object({
  phone: z.string()
    .regex(/^(\+250|0)[78][0-9]{8}$/, 'Phone number must be a valid Rwandan number'),
  amount: z.number()
    .int('Amount must be a whole number')
    .min(100, 'Minimum amount is 100 RWF'),
  reference: z.string().min(1, 'Reference is required'),
  description: z.string().optional(),
});

// ============================================
// LOAN SCHEMA (PayGo installment plan)
// ============================================
export const loanSchema = z.object({
  orderId: z.number().positive().optional(),
  customerId: z.number().positive('Customer ID is required'),
  principalRwf: z.number()
    .int('Principal must be a whole number')
    .min(1000, 'Principal must be at least 1,000 RWF'),
  downPaymentRwf: z.number()
    .int('Down payment must be a whole number')
    .min(0, 'Down payment cannot be negative')
    .default(0),
  interestRateBps: z.number()
    .int('Interest rate must be a whole number of basis points')
    .min(0, 'Interest rate cannot be negative')
    .max(5000, 'Interest rate looks unreasonably high (max 50%)')
    .default(0),
  termMonths: z.number()
    .int('Term must be a whole number of months')
    .min(1, 'Term must be at least 1 month')
    .max(24, 'Term must be at most 24 months'),
  guarantorType: z.enum(['none', 'school', 'ngo', 'individual']).default('none'),
  guarantorName: z.string().max(100).optional().or(z.literal('')),
  guarantorPhone: z.string()
    .regex(/^(\+250|0)[78][0-9]{8}$/, 'Guarantor phone must be a valid Rwandan number')
    .optional()
    .or(z.literal('')),
  notes: z.string().max(500).optional(),
});

// ============================================
// INSTALLMENT PAYMENT SCHEMA
// ============================================
export const installmentPaymentSchema = z.object({
  amountRwf: z.number()
    .int('Amount must be a whole number')
    .positive('Amount must be greater than 0'),
  method: z.enum(['momo', 'cash', 'bank', 'agent']),
  phone: z.string()
    .regex(/^(\+250|0)[78][0-9]{8}$/, 'Phone number must be a valid Rwandan number')
    .optional()
    .or(z.literal('')),
  note: z.string().max(500).optional(),
});

// ============================================
// INSTALLMENT PENALTY/WAIVER SCHEMA
// ============================================
export const installmentAdjustmentSchema = z.object({
  amountRwf: z.number().int().positive('Amount must be greater than 0'),
  note: z.string().max(500).optional(),
});

// ============================================
// MOMO INSTALLMENT PAYMENT SCHEMA (public, customer self-service)
// ============================================
export const momoInstallmentPaymentSchema = z.object({
  amountRwf: z.number()
    .int('Amount must be a whole number')
    .min(100, 'Minimum payment amount is 100 RWF'),
  phone: z.string()
    .regex(/^(\+250|0)[78][0-9]{8}$/, 'Phone number must be a valid Rwandan number'),
});

// ============================================
// AGENT (RESELLER) SCHEMA — admin-managed
// ============================================
export const agentSchema = z.object({
  name: z.string().min(2, 'Name is required').max(100),
  code: z.string().min(2, 'Reseller code is required').max(50)
    .regex(/^[A-Za-z0-9\-]+$/, 'Code may only contain letters, numbers, and hyphens'),
  phone: z.string().regex(/^(\+250|0)[78][0-9]{8}$/, 'Phone number must be a valid Rwandan number'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  region: z.string().max(50).optional().or(z.literal('')),
  district: z.string().max(100).optional().or(z.literal('')),
  // Omit to inherit the platform-wide default commission rate at creation time.
  commissionRateBps: z.number().int().min(0).max(5000).optional(),
  notes: z.string().max(500).optional(),
});

export const agentUpdateSchema = agentSchema.partial().extend({
  status: z.enum(['pending', 'approved', 'active', 'suspended', 'rejected']).optional(),
});

// One row of a bulk reseller import — mirrors the columns Kosmotive's
// existing spreadsheets already use (Name, Code, Phone, Email), so an
// admin can upload the exact file they already have.
export const agentImportRowSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  phone: z.string().min(9),
  email: z.string().optional().or(z.literal('')),
  region: z.string().optional().or(z.literal('')),
});

// ============================================
// AGENT SELF-SERVICE SCHEMAS — public registration & login
// ============================================
export const agentRegisterSchema = z.object({
  firstName: z.string().min(2, 'First name is required').max(50).regex(/^[A-Za-z\s\-]+$/, 'Letters only'),
  lastName: z.string().min(2, 'Last name is required').max(50).regex(/^[A-Za-z\s\-]+$/, 'Letters only'),
  phone: z.string().regex(/^(\+250|0)[78][0-9]{8}$/, 'Enter a valid Rwandan phone number'),
  email: z.string().email('Invalid email address'),
  nationalId: z.string().regex(/^[0-9]{16}$/, 'National ID must be 16 digits'),
  district: z.string().min(2, 'District is required'),
  sector: z.string().min(2, 'Sector is required'),
  cell: z.string().min(2, 'Cell is required'),
  village: z.string().min(2, 'Village is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const agentLoginSchema = z.object({
  identifier: z.string().min(3, 'Enter your phone number or email'), // phone or email
  password: z.string().min(1, 'Password is required'),
});

// An agent registering a customer on a walk-in's behalf — same identity
// fields as the public customer schema, reused rather than duplicated.
export const agentCustomerSchema = customerSchema;

// An agent creating a sale — mirrors orderSchema's items/paymentMethod/
// installmentPlan, but the customer is resolved by ID (an existing
// customer of theirs) or inline details for a brand-new walk-in, and
// agentId is NEVER accepted from the client — it's taken from the
// authenticated agent's own session server-side.
export const agentOrderSchema = z.object({
  customerId: z.number().int().positive().optional(),
  customer: customerSchema.optional(),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  paymentMethod: z.enum(['Mobile Money (MTN / Airtel)', 'Cash on Delivery', 'PayGo Installments']),
  installmentPlan: orderInstallmentPlanSchema.optional(),
  notes: z.string().max(500).optional(),
}).refine((data) => data.customerId || data.customer, {
  message: 'Provide either an existing customerId or new customer details',
  path: ['customer'],
});

// Types
export type CustomerInput = z.infer<typeof customerSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type TokenInput = z.infer<typeof tokenSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type MomoPaymentInput = z.infer<typeof momoPaymentSchema>;
export type LoanInput = z.infer<typeof loanSchema>;
export type InstallmentPaymentInput = z.infer<typeof installmentPaymentSchema>;
export type InstallmentAdjustmentInput = z.infer<typeof installmentAdjustmentSchema>;
export type MomoInstallmentPaymentInput = z.infer<typeof momoInstallmentPaymentSchema>;
export type OrderInstallmentPlanInput = z.infer<typeof orderInstallmentPlanSchema>;
export type AgentInput = z.infer<typeof agentSchema>;
export type AgentUpdateInput = z.infer<typeof agentUpdateSchema>;
export type AgentRegisterInput = z.infer<typeof agentRegisterSchema>;
export type AgentLoginInput = z.infer<typeof agentLoginSchema>;
export type AgentOrderInput = z.infer<typeof agentOrderSchema>;
