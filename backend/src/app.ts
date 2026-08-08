import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { eq } from 'drizzle-orm';

import { testDatabaseConnection, db } from './config/database';
import { EmailService } from './services/email.service';
import { InventoryService } from './services/inventory.service';
import { orders, payments, orderItems } from './db/schema';

import productsRouter from './routes/products';
import ordersRouter from './routes/orders';
import paymentsRouter from './routes/payments';
import adminAuthRouter from './routes/admin-auth';
import adminDashboardRouter from './routes/admin-dashboard';
import adminInventoryRouter from './routes/admin-inventory';

// Load environment variables first
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CORS origins
// ============================================
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:3001', 'http://localhost:5173', 'http://localhost:4173');
}

// ============================================
// Middleware
// ============================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// Health Check
// ============================================
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.1.0',
    services: {
      database: 'supabase-postgresql',
      email: 'resend',
      payment: 'mtn-momo',
    },
  });
});

// ============================================
// Static files (admin dashboard + product images)
// ============================================
app.use(express.static('public'));

// ============================================
// API Routes
// ============================================
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin', adminAuthRouter);
app.use('/api/admin/dashboard', adminDashboardRouter);
app.use('/api/admin/inventory', adminInventoryRouter);

// ============================================
// MoMo Webhook
// POST /api/webhooks/momo
//
// MTN calls this URL after a Request-to-Pay completes or fails.
// Expected payload (simplified MTN format):
//   {
//     "referenceId": "uuid-from-X-Reference-Id-header",
//     "status": "SUCCESSFUL" | "FAILED" | "PENDING",
//     "financialTransactionId": "...",
//     "externalId": "order-number",
//     "amount": "5000",
//     "currency": "RWF",
//     "payer": { "partyIdType": "MSISDN", "partyId": "250788..." }
//   }
//
// Signature verification: MTN does not yet publish a standard signing spec
// for all environments, so we verify that the referenceId exists in our own
// payments table (it was created by us at initiate-time) as the integrity check.
// ============================================
app.post('/api/webhooks/momo', async (req, res) => {
  // Acknowledge immediately so MTN doesn't retry
  res.status(200).json({ received: true });

  try {
    const payload = req.body;
    console.log('📲 MoMo Webhook received:', JSON.stringify(payload, null, 2));

    const referenceId: string | undefined = payload.referenceId;
    const rawStatus: string = (payload.status || '').toUpperCase();

    if (!referenceId) {
      console.warn('Webhook: missing referenceId — ignoring');
      return;
    }

    // Look up the payment row we created at initiate-time
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.momoTransactionId, referenceId));

    if (!payment) {
      console.warn(`Webhook: no payment row found for referenceId=${referenceId}`);
      return;
    }

    // Idempotency guard — skip if already finalized
    if (payment.status === 'paid' || payment.status === 'failed') {
      console.log(`Webhook: payment ${payment.id} already in terminal state "${payment.status}" — skipping`);
      return;
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, payment.orderId));

    if (!order) {
      console.error(`Webhook: order ${payment.orderId} not found for payment ${payment.id}`);
      return;
    }

    // ----------------------------------------
    // SUCCESSFUL payment
    // ----------------------------------------
    if (rawStatus === 'SUCCESSFUL') {
      const now = new Date();

      await db
        .update(payments)
        .set({
          status: 'paid',
          paidAt: now,
          notes: `Confirmed via MoMo webhook. financialTransactionId: ${payload.financialTransactionId || 'n/a'}`,
          updatedAt: now,
        })
        .where(eq(payments.id, payment.id));

      await db
        .update(orders)
        .set({
          paymentStatus: 'paid',
          orderStatus: 'confirmed',
          updatedAt: now,
        })
        .where(eq(orders.id, order.id));

      await InventoryService.deductStockForOrder(order.id);

      console.log(`✅ Webhook: order ${order.orderNumber} marked PAID`);

      // Send payment receipt to customer (if they have an email)
      if (order.customerEmail) {
        const items = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id));

        await EmailService.sendPaymentReceipt({
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          amountRwf: payment.amountRwf,
          paidAt: now,
          items: items.map((i) => ({
            name: i.productName,
            quantity: i.quantity,
            priceRwf: i.priceRwf,
            subtotalRwf: i.subtotalRwf,
          })),
        }).catch((err) => console.error('Receipt email error (non-fatal):', err));
      }

      // Notify the admin
      await EmailService.sendAdminPaymentAlert({
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        amountRwf: payment.amountRwf,
        status: 'paid',
      }).catch((err) => console.error('Admin alert email error (non-fatal):', err));
    }

    // ----------------------------------------
    // FAILED payment
    // ----------------------------------------
    else if (rawStatus === 'FAILED') {
      const now = new Date();

      await db
        .update(payments)
        .set({
          status: 'failed',
          notes: `Failed via MoMo webhook. Reason: ${payload.reason || 'unspecified'}`,
          updatedAt: now,
        })
        .where(eq(payments.id, payment.id));

      await db
        .update(orders)
        .set({
          paymentStatus: 'failed',
          updatedAt: now,
        })
        .where(eq(orders.id, order.id));

      console.log(`❌ Webhook: payment for order ${order.orderNumber} FAILED — reason: ${payload.reason || 'unspecified'}`);
    } else {
      console.log(`Webhook: unhandled status "${rawStatus}" for payment ${payment.id} — no action taken`);
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Response already sent above; just log
  }
});

// ============================================
// Test email endpoint (disable in production if desired)
// ============================================
app.post('/api/test/email', async (req, res) => {
  try {
    const { to, subject, message } = req.body;
    const success = await EmailService.sendEmail({
      to: to || process.env.ADMIN_EMAIL || 'test@example.com',
      subject: subject || 'Test Email from Kosmotive Backend',
      html: `<h2>Test Email</h2><p>${message || 'Backend is working!'}</p><p><strong>Time:</strong> ${new Date().toLocaleString()}</p>`,
      text: message || 'Backend is working!',
    });
    res.json({ success, message: success ? 'Test email sent!' : 'Email failed — check Resend API key' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// ============================================
// 404 Handler
// ============================================
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ============================================
// Global Error Handler
// ============================================
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============================================
// Start Server
// ============================================
async function startServer() {
  try {
    await testDatabaseConnection();
    await EmailService.testConnection();

    app.listen(PORT, () => {
      console.log(`
  🚀 Kosmotive Backend Server v1.1.0
  =====================================
  📡 Port     : ${PORT}
  🌍 Env      : ${process.env.NODE_ENV || 'development'}
  📧 Email    : Resend (${process.env.EMAIL_FROM || 'not configured'})
  📱 MoMo     : ${process.env.MOMO_ENVIRONMENT || 'sandbox'}
  🗄️  Database : Supabase PostgreSQL
  =====================================
  ✅ Server ready!

  Endpoints:
    GET  /api/health
    GET  /api/products
    POST /api/orders
    GET  /api/orders/:orderNumber/status
    POST /api/payments/momo/initiate
    GET  /api/payments/momo/status/:referenceId
    POST /api/webhooks/momo               ← MoMo callback
    POST /api/admin/login
    GET  /api/admin/me
    GET  /api/admin/momo-check             ← MoMo credential diagnostic
    GET  /api/admin/dashboard
    GET  /api/admin/inventory
    PATCH /api/admin/inventory/:id/stock
    PATCH /api/admin/inventory/:id/threshold
    GET  /api/admin/inventory/:id/movements
      `);
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

startServer();

export default app;
