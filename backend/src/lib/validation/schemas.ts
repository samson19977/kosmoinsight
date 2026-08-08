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
// ORDER SCHEMA
// ============================================
export const orderSchema = z.object({
  customer: customerSchema,
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  paymentMethod: z.enum(['Mobile Money (MTN / Airtel)', 'Cash on Delivery', 'Bank Transfer']),
  notes: z.string().max(500, 'Notes must be less than 500 characters').optional(),
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

// Types
export type CustomerInput = z.infer<typeof customerSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type TokenInput = z.infer<typeof tokenSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type MomoPaymentInput = z.infer<typeof momoPaymentSchema>;
