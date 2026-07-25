import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { testDatabaseConnection } from './config/database';
import { EmailService } from './services/email.service';

import productsRouter from './routes/products';
import ordersRouter from './routes/orders';
import paymentsRouter from './routes/payments';
import adminAuthRouter from './routes/admin-auth';
import adminDashboardRouter from './routes/admin-dashboard';

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

// Always allow localhost in development
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:3001', 'http://localhost:5173', 'http://localhost:4173');
}

// ============================================
// Middleware
// ============================================
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, mobile apps)
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
    version: '1.0.0',
    services: {
      database: 'supabase-postgresql',
      email: 'nodemailer-gmail',
      payment: 'mtn-momo',
    },
  });
});

// ============================================
// Routes
// ============================================
app.use(express.static('public')); // serves /images/*.png and the /admin dashboard

app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin', adminAuthRouter);
app.use('/api/admin/dashboard', adminDashboardRouter);

// ============================================
// MoMo Webhook (for production callback from MTN)
// ============================================
app.post('/api/webhooks/momo', (req, res) => {
  try {
    const payload = req.body;
    console.log('📲 MoMo Webhook received:', JSON.stringify(payload, null, 2));
    // TODO: Validate signature, update order payment status, send receipt email
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================
// Test endpoints (disable in production if desired)
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
    res.json({ success, message: success ? 'Test email sent!' : 'Email failed – check SMTP credentials' });
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
    // Test DB (non-fatal – server still starts so Render health check passes)
    await testDatabaseConnection();

    // Test email (non-fatal)
    await EmailService.testConnection();

    app.listen(PORT, () => {
      console.log(`
  🚀 Kosmotive Backend Server
  =============================
  📡 Port     : ${PORT}
  🌍 Env      : ${process.env.NODE_ENV || 'development'}
  📧 Email    : ${process.env.EMAIL_FROM || '(not configured)'}
  📱 MoMo     : ${process.env.MOMO_ENVIRONMENT || 'sandbox'}
  🗄️  Database : Supabase PostgreSQL
  =============================
  ✅ Server ready!

  Endpoints:
    GET  /api/health
    GET  /api/products
    POST /api/orders
    GET  /api/orders/:orderNumber/status
    POST /api/payments/momo/initiate
    GET  /api/payments/momo/status/:referenceId
    POST /api/test/email
    POST /api/admin/login
    GET  /api/admin/me
    GET  /api/admin/dashboard   (revenue, orders, top products, trends)
    GET  /api/orders            (admin, requires token)
      `);
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

startServer();

export default app;
