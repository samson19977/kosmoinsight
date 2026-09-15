import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { eq } from 'drizzle-orm';

import { testDatabaseConnection, db } from './config/database';
import { EmailService } from './services/email.service';
import { PaymentReconciliationService } from './services/paymentReconciliation.service';
import { payments } from './db/schema';
import { createLogger } from './lib/logger';

const logger = createLogger('app');

import productsRouter from './routes/products';
import ordersRouter from './routes/orders';
import locationsRouter from './routes/locations';
import paymentsRouter from './routes/payments';
import adminAuthRouter from './routes/admin-auth';
import adminDashboardRouter from './routes/admin-dashboard';
import adminInventoryRouter from './routes/admin-inventory';
import adminCustomersRouter from './routes/admin-customers';
import adminLedgerRouter from './routes/admin-ledger';
import loansRouter, { publicLoanRouter } from './routes/loans';
import { LoanService } from './services/loan.service';
import agentsRouter from './routes/agents';
import agentSelfRouter from './routes/agent-self';
import ussdRouter from './routes/ussd';

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
    version: '1.2.0',
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
app.use('/api/locations', locationsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin', adminAuthRouter);
app.use('/api/admin/dashboard', adminDashboardRouter);
app.use('/api/admin/inventory', adminInventoryRouter);
app.use('/api/admin/customers', adminCustomersRouter);
app.use('/api/admin/ledger', adminLedgerRouter);
app.use('/api/admin/loans', loansRouter);
app.use('/api/loans', publicLoanRouter);
app.use('/api/admin/agents', agentsRouter);
app.use('/api/agents', agentSelfRouter);
app.use('/api/ussd', ussdRouter);

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
    logger.info('MoMo webhook received', { referenceId: payload.referenceId, status: payload.status });

    const referenceId: string | undefined = payload.referenceId;
    const rawStatus: string = (payload.status || '').toUpperCase();

    if (!referenceId) {
      logger.warn('Webhook missing referenceId — ignoring');
      return;
    }

    // Look up the payment row we created at initiate-time
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.momoTransactionId, referenceId));

    if (!payment) {
      // Not a one-time order payment — check if it's a PayGo installment
      // payment instead (same webhook URL is used for both flows).
      const outcome = rawStatus === 'SUCCESSFUL' ? 'SUCCESSFUL' : rawStatus === 'FAILED' ? 'FAILED' : null;
      if (outcome) {
        const result = await LoanService.resolveMomoReference(referenceId, outcome);
        if (result.resolved) {
          logger.info('PayGo installment resolved via MoMo webhook', { installmentId: result.installmentId, outcome, allPaid: result.allPaid });
          return;
        }
      }
      logger.warn('Webhook: no payment or pending installment found', { referenceId });
      return;
    }

    // Idempotency guard — skip if already finalized. (This check is now
    // belt-and-suspenders: the atomic UPDATE inside
    // PaymentReconciliationService is what actually closes the race
    // against the order-status poll, MoMo-status poll, and admin manual
    // confirm — all four entry points that can independently observe a
    // payment outcome now go through that single atomic transition.)
    if (payment.status === 'paid' || payment.status === 'failed') {
      logger.info('Webhook: payment already in terminal state — skipping', { paymentId: payment.id, status: payment.status });
      return;
    }

    // ----------------------------------------
    // SUCCESSFUL payment
    // ----------------------------------------
    if (rawStatus === 'SUCCESSFUL') {
      const result = await PaymentReconciliationService.markOrderPaid(payment.orderId, {
        note: `Confirmed via MoMo webhook. financialTransactionId: ${payload.financialTransactionId || 'n/a'}`,
      });
      if (!result.alreadyPaid) {
        logger.info('Webhook: order marked PAID', { orderNumber: result.order!.orderNumber });
      }
    }

    // ----------------------------------------
    // FAILED payment
    // ----------------------------------------
    else if (rawStatus === 'FAILED') {
      await PaymentReconciliationService.markOrderFailed(payment.orderId, payload.reason || 'unspecified');
      logger.warn('Webhook: payment FAILED', { orderId: payment.orderId, reason: payload.reason || 'unspecified' });
    } else {
      logger.info('Webhook: unhandled status — no action taken', { status: rawStatus, paymentId: payment.id });
    }
  } catch (error) {
    logger.error('Webhook processing error', error);
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
  logger.error('Unhandled error', err);
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
  🚀 Kosmotive Backend Server v1.2.0
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
    POST /api/admin/loans                  ← create PayGo installment plan
    GET  /api/admin/loans                  ← list loans
    GET  /api/admin/loans/:loanNumber      ← loan detail + schedule + ledger
    POST /api/admin/loans/installments/:id/pay
    POST /api/admin/loans/installments/:id/penalty
    POST /api/admin/loans/installments/:id/waive
    PATCH /api/admin/loans/:loanNumber/cancel
    POST /api/admin/loans/run-automation   ← manual trigger (also runs on a 24h timer)
    GET  /api/admin/loans/metrics/portfolio
    GET  /api/admin/loans/metrics/cac-ltv
    GET  /api/loans/:loanNumber/status     ← public, phone-gated customer lookup
    POST /api/ussd                         ← USSD gateway (buy, track order, check PayGo loan)
    GET  /api/admin/agents                 ← list resellers/agents + live commission totals
    GET  /api/admin/agents/summary         ← counts by status (pending/active/suspended...)
    POST /api/admin/agents                 ← create an agent directly (skips approval)
    PATCH /api/admin/agents/:id            ← update agent / commission rate / status
    GET  /api/admin/agents/:id             ← agent detail: customers + orders + loans + commissions
    POST /api/admin/agents/:id/approve     ← pending -> active
    POST /api/admin/agents/:id/reject
    POST /api/admin/agents/:id/suspend
    POST /api/admin/agents/:id/reactivate
    POST /api/admin/agents/:id/reset-password
    POST /api/admin/agents/import          ← bulk-upload a reseller spreadsheet (.xlsx/.csv)
    GET  /api/admin/agents/export          ← download all agents + commissions as .xlsx
    POST /api/admin/agents/:id/pay-commission
    GET/PATCH /api/admin/agents/settings/default-commission
    POST /api/agents/register              ← PUBLIC — agent self-registration (status: pending)
    POST /api/agents/login                 ← PUBLIC — agent login (phone/email + password)
    GET  /api/agents/me, /dashboard, /referral, /customers, /orders, /commissions, /payouts
    POST /api/agents/customers             ← agent registers a customer
    POST /api/agents/orders                ← agent creates a sale (cash/momo/PayGo)
    POST /api/agents/loans/:loanNumber/installments/:id/pay ← agent-collected repayment
      `);
    });

    // ============================================
    // PayGo daily automation — reminders, overdue sweep + grace-period
    // penalties, and consecutive-miss default detection. Runs once at
    // startup (so nothing waits a full day after a deploy/restart) and
    // then every 24h. No extra dependency (no node-cron) since a single
    // daily tick is all this needs; swap for a real scheduler if this
    // ever needs to run more than once a day or survive across instances.
    // ============================================
    LoanService.runDailyAutomation().catch((err) =>
      logger.error('Initial loan automation run failed (non-fatal)', err)
    );
    setInterval(() => {
      LoanService.runDailyAutomation().catch((err) =>
        logger.error('Scheduled loan automation run failed (non-fatal)', err)
      );
    }, 24 * 60 * 60 * 1000);

    // ============================================
    // PayGo MoMo reconciliation — the webhook above is the fast path, but
    // MTN's sandbox (and flaky networks generally) don't always deliver
    // webhooks reliably. This poll is the safety net: it checks any
    // installment with a pending MoMo request directly against MTN every
    // few minutes, so "customer approves on their phone" reliably marks
    // the installment paid even if the webhook never arrives.
    // ============================================
    setTimeout(() => {
      LoanService.reconcilePendingMomoTransactions()
        .then((summary) => {
          if (summary.checked > 0) logger.info('MoMo reconciliation', summary);
        })
        .catch((err) => logger.error('Initial MoMo reconciliation failed (non-fatal)', err));
    }, 30_000);
    setInterval(() => {
      LoanService.reconcilePendingMomoTransactions()
        .then((summary) => {
          if (summary.checked > 0) logger.info('MoMo reconciliation', summary);
        })
        .catch((err) => logger.error('Scheduled MoMo reconciliation failed (non-fatal)', err));
    }, 3 * 60 * 1000);
  } catch (error) {
    logger.error('Server startup failed', error);
    process.exit(1);
  }
}

startServer();

export default app;
