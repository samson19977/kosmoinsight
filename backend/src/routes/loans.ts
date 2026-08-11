import { Router, Request, Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../config/database';
import { loans, customers } from '../db/schema';
import { validate } from '../middleware/validate';
import { requireAdmin, AuthedRequest } from '../middleware/auth';
import { loanSchema, installmentPaymentSchema } from '../lib/validation/schemas';
import { LoanService } from '../services/loan.service';

const router = Router();

// All loan/installment management is admin-only — this is back-office
// PayGo administration, not a customer-facing storefront surface.
router.use(requireAdmin);

// ============================================
// POST /api/admin/loans
// Creates a PayGo loan for an existing order + generates its full
// installment schedule in one step.
// ============================================
router.post('/', validate(loanSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { loan, installments: schedule } = await LoanService.createLoanWithSchedule(req.body);
    res.status(201).json({ success: true, loan, installments: schedule });
  } catch (error: any) {
    console.error('Create loan error:', error);
    res.status(500).json({ error: error.message || 'Failed to create loan' });
  }
});

// ============================================
// GET /api/admin/loans
// Lists loans with customer name/phone attached, most recent first.
// Optional ?status=active|completed|defaulted|cancelled filter.
// ============================================
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query;

    const query = db
      .select({
        id: loans.id,
        orderId: loans.orderId,
        customerId: loans.customerId,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        customerPhone: customers.phone,
        customerDistrict: customers.district,
        principalRwf: loans.principalRwf,
        downPaymentRwf: loans.downPaymentRwf,
        interestRateBps: loans.interestRateBps,
        termMonths: loans.termMonths,
        status: loans.status,
        startDate: loans.startDate,
        expectedPayoffDate: loans.expectedPayoffDate,
        createdAt: loans.createdAt,
      })
      .from(loans)
      .innerJoin(customers, eq(loans.customerId, customers.id))
      .orderBy(desc(loans.createdAt))
      .$dynamic();

    const rows = status
      ? await query.where(eq(loans.status, String(status)))
      : await query;

    res.json({ success: true, loans: rows });
  } catch (error) {
    console.error('List loans error:', error);
    res.status(500).json({ error: 'Failed to fetch loans' });
  }
});

// ============================================
// GET /api/admin/loans/metrics/repayment-rate
// ?district=Kicukiro (optional)
// ============================================
router.get('/metrics/repayment-rate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { district } = req.query;
    const metrics = await LoanService.getRepaymentRate({ district: district ? String(district) : undefined });
    res.json({ success: true, ...metrics });
  } catch (error) {
    console.error('Repayment rate error:', error);
    res.status(500).json({ error: 'Failed to compute repayment rate' });
  }
});

// ============================================
// GET /api/admin/loans/metrics/cac-ltv
// ?channel=field-agent (optional)
// ============================================
router.get('/metrics/cac-ltv', async (req: Request, res: Response): Promise<void> => {
  try {
    const { channel } = req.query;
    const metrics = await LoanService.getCacLtvMetrics({ channel: channel ? String(channel) : undefined });
    res.json({ success: true, ...metrics });
  } catch (error) {
    console.error('CAC/LTV metrics error:', error);
    res.status(500).json({ error: 'Failed to compute CAC/LTV metrics' });
  }
});

// ============================================
// POST /api/admin/loans/sweep-overdue
// Runs the overdue/penalty sweep. Intended to be called by a daily
// cron (or manually from the dashboard) — idempotent to re-run.
// ============================================
router.post('/sweep-overdue', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await LoanService.applyOverduePenalties();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Overdue sweep error:', error);
    res.status(500).json({ error: 'Failed to run overdue sweep' });
  }
});

// ============================================
// GET /api/admin/loans/:id
// Full loan detail: loan + installment schedule + transaction log.
// ============================================
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const loanId = Number(req.params.id);
    if (!Number.isInteger(loanId) || loanId <= 0) {
      res.status(400).json({ error: 'Invalid loan ID' });
      return;
    }

    const detail = await LoanService.getLoanDetail(loanId);
    if (!detail) {
      res.status(404).json({ error: 'Loan not found' });
      return;
    }

    res.json({ success: true, ...detail });
  } catch (error) {
    console.error('Loan detail error:', error);
    res.status(500).json({ error: 'Failed to fetch loan detail' });
  }
});

// ============================================
// POST /api/admin/loans/installments/pay
// Records a payment against ONE specific installment — for precise
// manual correction. General collections should use POST /:id/pay.
// ============================================
router.post(
  '/installments/pay',
  validate(installmentPaymentSchema),
  async (req: AuthedRequest, res: Response): Promise<void> => {
    try {
      const updated = await LoanService.recordInstallmentPayment({
        ...req.body,
        adminId: req.admin?.id,
      });
      res.json({ success: true, installment: updated });
    } catch (error: any) {
      console.error('Record installment payment error:', error);
      res.status(error.message?.includes('not found') ? 404 : 500).json({
        error: error.message || 'Failed to record payment',
      });
    }
  }
);

// ============================================
// POST /api/admin/loans/:id/pay
// Records a cash/bank payment against a LOAN (not one installment) —
// auto-allocates across outstanding installments oldest-first. Covers
// both "pay one installment in full" and "pay several at once" from a
// single amount, same waterfall logic the automated MoMo path uses.
// ============================================
router.post('/:id/pay', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const loanId = Number(req.params.id);
    const { amountRwf, paymentMethod, note } = req.body;

    if (!Number.isInteger(loanId) || loanId <= 0) {
      res.status(400).json({ error: 'Invalid loan ID' });
      return;
    }
    if (!Number.isInteger(amountRwf) || amountRwf <= 0) {
      res.status(400).json({ error: 'amountRwf must be a positive whole number' });
      return;
    }
    if (!['cash', 'bank', 'momo'].includes(paymentMethod)) {
      res.status(400).json({ error: 'paymentMethod must be one of cash, bank, momo' });
      return;
    }

    const result = await LoanService.recordLoanPayment({
      loanId,
      amountRwf,
      paymentMethod,
      adminId: req.admin?.id,
      note,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Record loan payment error:', error);
    res.status(error.message?.includes('not found') ? 404 : 500).json({
      error: error.message || 'Failed to record payment',
    });
  }
});

// ============================================
// POST /api/admin/loans/:id/collect
// Pushes a MoMo request-to-pay to the customer's phone for what's
// currently due on the loan (or a custom/full-payoff amount). Returns
// immediately with a pending transaction — the background reconciler
// (or POST /reconcile-momo) confirms it and auto-allocates once MTN
// reports success, no further admin action needed.
// Body: { amountRwf?: number, payoffAll?: boolean }
// ============================================
router.post('/:id/collect', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const loanId = Number(req.params.id);
    if (!Number.isInteger(loanId) || loanId <= 0) {
      res.status(400).json({ error: 'Invalid loan ID' });
      return;
    }

    const { amountRwf, payoffAll } = req.body || {};
    const result = await LoanService.initiateMomoCollection({
      loanId,
      amountRwf: Number.isInteger(amountRwf) && amountRwf > 0 ? amountRwf : undefined,
      payoffAll: Boolean(payoffAll),
      adminId: req.admin?.id,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Initiate MoMo collection error:', error);
    res.status(error.message?.includes('not found') || error.message?.includes('Nothing') ? 400 : 500).json({
      error: error.message || 'Failed to initiate MoMo collection',
    });
  }
});

// ============================================
// GET /api/admin/loans/:id/collectible
// "What's owed right now" for a loan — used to prefill the collection
// amount in the dashboard. ?payoffAll=true includes future installments.
// ============================================
router.get('/:id/collectible', async (req: Request, res: Response): Promise<void> => {
  try {
    const loanId = Number(req.params.id);
    if (!Number.isInteger(loanId) || loanId <= 0) {
      res.status(400).json({ error: 'Invalid loan ID' });
      return;
    }
    const payoffAll = req.query.payoffAll === 'true';
    const result = await LoanService.getCollectibleAmount(loanId, payoffAll);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Get collectible amount error:', error);
    res.status(500).json({ error: 'Failed to compute collectible amount' });
  }
});

// ============================================
// POST /api/admin/loans/reconcile-momo
// Manually triggers the same reconciliation the background scheduler
// runs automatically every few minutes — checks all pending MoMo
// collections against MTN and auto-allocates any that succeeded.
// ============================================
router.post('/reconcile-momo', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await LoanService.reconcilePendingMomoTransactions();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Reconcile MoMo error:', error);
    res.status(500).json({ error: 'Failed to reconcile pending MoMo collections' });
  }
});

export default router;
