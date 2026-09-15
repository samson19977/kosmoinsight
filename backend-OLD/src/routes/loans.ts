import { Router, Request, Response } from 'express';
import { eq, desc, and, or, ilike, inArray, sql } from 'drizzle-orm';
import { parsePageParams, paginatedResponse, sendCsv } from '../lib/listQuery';
import { validate } from '../middleware/validate';
import {
  loanSchema,
  installmentPaymentSchema,
  installmentAdjustmentSchema,
  momoInstallmentPaymentSchema,
} from '../lib/validation/schemas';
import { requireAdmin, AuthedRequest } from '../middleware/auth';
import { db } from '../config/database';
import { loans, installments, loanTransactions, customers, loanAgreements } from '../db/schema';
import { LoanService } from '../services/loan.service';

const router = Router();

// ============================================
// POST /api/admin/loans — create a new PayGo installment plan
// ============================================
router.post('/', requireAdmin, validate(loanSchema), async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const loan = await LoanService.createLoan({ ...req.body, adminId: req.admin?.id ?? null });
    const schedule = await db.select().from(installments).where(eq(installments.loanId, loan.id));
    res.status(201).json({ success: true, loan, schedule });
  } catch (error: any) {
    console.error('Create loan error:', error);
    res.status(400).json({ error: error.message || 'Failed to create loan' });
  }
});

// Builds the shared WHERE clause for the paginated list and the CSV export.
// Search matches loan #, customer first/last name, or phone (via a join —
// no more pulling the entire customers table into memory to filter in JS).
function buildLoansFilter(query: any, search: string) {
  const clauses = [];
  if (search) {
    const like = `%${search}%`;
    clauses.push(or(ilike(loans.loanNumber, like), ilike(customers.firstName, like), ilike(customers.lastName, like), ilike(customers.phone, like)));
  }
  if (query.status && typeof query.status === 'string') clauses.push(eq(loans.status, query.status));
  return clauses.length ? and(...clauses) : undefined;
}

async function enrichLoansWithProgress(loanRows: (typeof loans.$inferSelect & { customerName: string | null; customerPhone: string | null })[]) {
  if (loanRows.length === 0) return [];
  const loanIds = loanRows.map((l) => l.id);
  // Only pull installments belonging to THIS page of loans, not the whole table.
  const rows = await db.select().from(installments).where(inArray(installments.loanId, loanIds));
  return loanRows.map((loan) => {
    const own = rows.filter((i) => i.loanId === loan.id);
    const paidRwf = own.reduce((s, i) => s + (i.amountPaidRwf || 0), 0);
    const dueRwf = own.reduce((s, i) => s + (i.amountDueRwf || 0), 0);
    const overdueCount = own.filter((i) => i.status === 'overdue').length;
    return {
      ...loan,
      repaymentRatePercent: dueRwf > 0 ? Math.round((paidRwf / dueRwf) * 1000) / 10 : 0,
      overdueInstallments: overdueCount,
    };
  });
}

// ============================================
// GET /api/admin/loans — paginated, searchable (loan #, customer name/phone),
// filterable (status) list of loans, most recent first.
// ============================================
router.get('/', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parsePageParams(req.query);
    const where = buildLoansFilter(req.query, params.search);

    const baseQuery = db
      .select({
        id: loans.id,
        loanNumber: loans.loanNumber,
        orderId: loans.orderId,
        customerId: loans.customerId,
        principalRwf: loans.principalRwf,
        downPaymentRwf: loans.downPaymentRwf,
        interestRateBps: loans.interestRateBps,
        termMonths: loans.termMonths,
        totalPayableRwf: loans.totalPayableRwf,
        status: loans.status,
        guarantorType: loans.guarantorType,
        guarantorName: loans.guarantorName,
        guarantorPhone: loans.guarantorPhone,
        disbursedAt: loans.disbursedAt,
        expectedPayoffDate: loans.expectedPayoffDate,
        completedAt: loans.completedAt,
        notes: loans.notes,
        createdAt: loans.createdAt,
        updatedAt: loans.updatedAt,
        customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
        customerPhone: customers.phone,
      })
      .from(loans)
      .leftJoin(customers, eq(loans.customerId, customers.id));

    const [rows, [{ count }]] = await Promise.all([
      baseQuery.where(where).orderBy(desc(loans.createdAt)).limit(params.pageSize).offset(params.offset),
      db.select({ count: sql<number>`count(*)::int` }).from(loans).leftJoin(customers, eq(loans.customerId, customers.id)).where(where),
    ]);

    const enriched = await enrichLoansWithProgress(rows as any);
    res.json(paginatedResponse(enriched, count, params));
  } catch (error) {
    console.error('List loans error:', error);
    res.status(500).json({ error: 'Failed to load loans' });
  }
});

// GET /api/admin/loans/export/csv — same search/status filter, all matching rows.
router.get('/export/csv', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parsePageParams(req.query);
    const where = buildLoansFilter(req.query, params.search);
    const rows = await db
      .select({
        id: loans.id,
        loanNumber: loans.loanNumber,
        orderId: loans.orderId,
        customerId: loans.customerId,
        principalRwf: loans.principalRwf,
        downPaymentRwf: loans.downPaymentRwf,
        interestRateBps: loans.interestRateBps,
        termMonths: loans.termMonths,
        totalPayableRwf: loans.totalPayableRwf,
        status: loans.status,
        guarantorType: loans.guarantorType,
        guarantorName: loans.guarantorName,
        guarantorPhone: loans.guarantorPhone,
        disbursedAt: loans.disbursedAt,
        expectedPayoffDate: loans.expectedPayoffDate,
        completedAt: loans.completedAt,
        notes: loans.notes,
        createdAt: loans.createdAt,
        updatedAt: loans.updatedAt,
        customerName: sql<string>`${customers.firstName} || ' ' || ${customers.lastName}`,
        customerPhone: customers.phone,
      })
      .from(loans)
      .leftJoin(customers, eq(loans.customerId, customers.id))
      .where(where)
      .orderBy(desc(loans.createdAt));
    const enriched = await enrichLoansWithProgress(rows as any);
    sendCsv(
      res,
      `loans-${new Date().toISOString().slice(0, 10)}.csv`,
      ['loanNumber', 'customerName', 'customerPhone', 'principalRwf', 'totalPayableRwf', 'termMonths', 'status', 'repaymentRatePercent', 'overdueInstallments', 'disbursedAt'],
      enriched.map((l: any) => ({ ...l, disbursedAt: l.disbursedAt?.toISOString?.() || l.disbursedAt }))
    );
  } catch (error) {
    console.error('Export loans CSV error:', error);
    res.status(500).json({ error: 'Failed to export loans' });
  }
});

// ============================================
// GET /api/admin/loans/:loanNumber — full loan detail with schedule + transaction history
// ============================================
router.get('/:loanNumber', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const [loan] = await db.select().from(loans).where(eq(loans.loanNumber, req.params.loanNumber));
    if (!loan) {
      res.status(404).json({ error: 'Loan not found' });
      return;
    }
    const [customer] = await db.select().from(customers).where(eq(customers.id, loan.customerId));
    const schedule = (
      await db.select().from(installments).where(eq(installments.loanId, loan.id))
    ).sort((a, b) => a.installmentNumber - b.installmentNumber);
    const transactions = await db
      .select()
      .from(loanTransactions)
      .where(eq(loanTransactions.loanId, loan.id))
      .orderBy(desc(loanTransactions.createdAt));
    const [agreement] = await db.select().from(loanAgreements).where(eq(loanAgreements.loanId, loan.id));

    res.json({ success: true, loan, customer, schedule, transactions, agreement: agreement || null });
  } catch (error) {
    console.error('Loan detail error:', error);
    res.status(500).json({ error: 'Failed to load loan' });
  }
});

// ============================================
// POST /api/admin/loans/installments/:installmentId/pay — record a payment
// ============================================
router.post(
  '/installments/:installmentId/pay',
  requireAdmin,
  validate(installmentPaymentSchema),
  async (req: AuthedRequest, res: Response): Promise<void> => {
    try {
      const installmentId = Number(req.params.installmentId);
      const result = await LoanService.recordPayment(installmentId, { ...req.body, adminId: req.admin?.id ?? null });
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Record installment payment error:', error);
      res.status(400).json({ error: error.message || 'Failed to record payment' });
    }
  }
);

// ============================================
// POST /api/admin/loans/installments/:installmentId/penalty — manual penalty
// ============================================
router.post(
  '/installments/:installmentId/penalty',
  requireAdmin,
  validate(installmentAdjustmentSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const installmentId = Number(req.params.installmentId);
      await LoanService.applyPenalty(installmentId, req.body.amountRwf, req.body.note);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Apply penalty error:', error);
      res.status(400).json({ error: error.message || 'Failed to apply penalty' });
    }
  }
);

// ============================================
// POST /api/admin/loans/installments/:installmentId/waive — waive a penalty (goodwill/dispute resolution)
// ============================================
router.post(
  '/installments/:installmentId/waive',
  requireAdmin,
  validate(installmentAdjustmentSchema),
  async (req: AuthedRequest, res: Response): Promise<void> => {
    try {
      const installmentId = Number(req.params.installmentId);
      const [installment] = await db.select().from(installments).where(eq(installments.id, installmentId));
      if (!installment) {
        res.status(404).json({ error: 'Installment not found' });
        return;
      }
      const waiveAmount = Math.min(req.body.amountRwf, installment.penaltyRwf || 0);
      await db
        .update(installments)
        .set({ penaltyRwf: (installment.penaltyRwf || 0) - waiveAmount, updatedAt: new Date() })
        .where(eq(installments.id, installmentId));
      await db.insert(loanTransactions).values({
        loanId: installment.loanId,
        installmentId: installment.id,
        type: 'waiver',
        amountRwf: waiveAmount,
        adminId: req.admin?.id ?? null,
        note: req.body.note || 'Penalty waived',
      });
      res.json({ success: true, waivedRwf: waiveAmount });
    } catch (error: any) {
      console.error('Waive penalty error:', error);
      res.status(400).json({ error: error.message || 'Failed to waive penalty' });
    }
  }
);

// ============================================
// PATCH /api/admin/loans/:loanNumber/cancel — cancel a loan (e.g. entered in error)
// ============================================
router.patch('/:loanNumber/cancel', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const [loan] = await db.select().from(loans).where(eq(loans.loanNumber, req.params.loanNumber));
    if (!loan) {
      res.status(404).json({ error: 'Loan not found' });
      return;
    }
    if (loan.status === 'completed') {
      res.status(400).json({ error: 'Cannot cancel a completed loan' });
      return;
    }
    await db.update(loans).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(loans.id, loan.id));
    res.json({ success: true });
  } catch (error) {
    console.error('Cancel loan error:', error);
    res.status(500).json({ error: 'Failed to cancel loan' });
  }
});

// ============================================
// POST /api/admin/loans/run-automation — manually trigger the daily automation
// (reminders, overdue sweep + penalties, default detection). Also runs on a
// timer from app.ts — this endpoint lets an admin trigger it on demand.
// ============================================
router.post('/run-automation', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const summary = await LoanService.runDailyAutomation();
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Run automation error:', error);
    res.status(500).json({ error: 'Automation run failed' });
  }
});

// ============================================
// GET /api/admin/loans-metrics/portfolio — repayment rate, overdue, at-risk, defaults
// GET /api/admin/loans-metrics/cac-ltv — CAC vs LTV
// (mounted here for convenience; also surfaced inside the main dashboard payload)
// ============================================
router.get('/metrics/portfolio', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const metrics = await LoanService.getPortfolioMetrics();
    res.json({ success: true, metrics });
  } catch (error) {
    console.error('Portfolio metrics error:', error);
    res.status(500).json({ error: 'Failed to compute portfolio metrics' });
  }
});

router.get('/metrics/cac-ltv', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const metrics = await LoanService.getCacLtvMetrics();
    res.json({ success: true, metrics });
  } catch (error) {
    console.error('CAC/LTV metrics error:', error);
    res.status(500).json({ error: 'Failed to compute CAC/LTV metrics' });
  }
});

// ============================================
// GET /api/loans/:loanNumber/status?phone=07... — PUBLIC customer-facing
// loan status lookup, phone-gated the same way order tracking works.
// Mounted separately (see app.ts) at /api/loans, not /api/admin/loans.
// ============================================
export const publicLoanRouter = Router();
publicLoanRouter.get('/:loanNumber/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { loanNumber } = req.params;
    const { phone } = req.query;

    const [loan] = await db.select().from(loans).where(eq(loans.loanNumber, loanNumber));
    if (!loan) {
      res.status(404).json({ error: 'Loan not found' });
      return;
    }

    const [customer] = await db.select().from(customers).where(eq(customers.id, loan.customerId));
    if (!customer || !phone || customer.phone !== phone) {
      res.status(403).json({ error: 'Phone number does not match this loan' });
      return;
    }

    const schedule = (
      await db.select().from(installments).where(eq(installments.loanId, loan.id))
    ).sort((a, b) => a.installmentNumber - b.installmentNumber);

    const paidRwf = schedule.reduce((s, i) => s + (i.amountPaidRwf || 0), 0);
    const dueRwf = schedule.reduce((s, i) => s + (i.amountDueRwf || 0), 0);

    const sanitize = (i: (typeof schedule)[number]) => ({
      id: i.id,
      installmentNumber: i.installmentNumber,
      dueDate: i.dueDate,
      amountDueRwf: i.amountDueRwf,
      amountPaidRwf: i.amountPaidRwf,
      penaltyRwf: i.penaltyRwf,
      status: i.status,
      pendingPayment: i.pendingMomoReferenceId
        ? { amountRwf: i.pendingMomoAmountRwf, initiatedAt: i.pendingMomoInitiatedAt }
        : null,
    });
    const nextUnpaid = schedule.find((i) => i.status !== 'paid') || null;

    res.json({
      success: true,
      loanNumber: loan.loanNumber,
      status: loan.status,
      totalPayableRwf: loan.totalPayableRwf,
      paidRwf,
      remainingRwf: Math.max(0, dueRwf - paidRwf),
      repaymentRatePercent: dueRwf > 0 ? Math.round((paidRwf / dueRwf) * 1000) / 10 : 0,
      nextInstallment: nextUnpaid ? sanitize(nextUnpaid) : null,
      schedule: schedule.map(sanitize),
    });
  } catch (error) {
    console.error('Public loan status error:', error);
    res.status(500).json({ error: 'Failed to load loan status' });
  }
});

// ============================================
// Lightweight in-memory rate limiter for the pay-momo endpoint — keyed by
// phone number. Prevents a customer (or a script) from hammering MTN with
// repeated Request-to-Pay prompts. Single-instance only; swap for a shared
// store (Redis) if this API ever runs on more than one Render instance.
// ============================================
const payMomoAttempts = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 3;

function isRateLimited(phone: string): boolean {
  const now = Date.now();
  const attempts = (payMomoAttempts.get(phone) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  payMomoAttempts.set(phone, attempts);
  return attempts.length >= RATE_LIMIT_MAX_ATTEMPTS;
}
function recordAttempt(phone: string) {
  const attempts = payMomoAttempts.get(phone) || [];
  attempts.push(Date.now());
  payMomoAttempts.set(phone, attempts);
}

// ============================================
// POST /api/loans/:loanNumber/installments/:installmentId/pay-momo — PUBLIC.
// Customer self-service: triggers an MTN MoMo Request-to-Pay prompt on
// their phone. Phone-gated the same way as the status lookup (must match
// the loan's customer record), rate-limited, and the actual payment is
// only ever applied once MTN confirms it — this endpoint never marks
// anything paid itself.
// ============================================
publicLoanRouter.post(
  '/:loanNumber/installments/:installmentId/pay-momo',
  validate(momoInstallmentPaymentSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { loanNumber, installmentId } = req.params;
      const { amountRwf, phone } = req.body;

      const [loan] = await db.select().from(loans).where(eq(loans.loanNumber, loanNumber));
      if (!loan) {
        res.status(404).json({ error: 'Loan not found' });
        return;
      }

      const [customer] = await db.select().from(customers).where(eq(customers.id, loan.customerId));
      if (!customer || customer.phone !== phone) {
        res.status(403).json({ error: 'Phone number does not match this loan' });
        return;
      }

      const [installment] = await db.select().from(installments).where(eq(installments.id, Number(installmentId)));
      if (!installment || installment.loanId !== loan.id) {
        res.status(404).json({ error: 'Installment not found on this loan' });
        return;
      }

      if (isRateLimited(phone)) {
        res.status(429).json({ error: 'Too many payment attempts — please wait a few minutes and try again.' });
        return;
      }
      recordAttempt(phone);

      const result = await LoanService.initiateMomoPayment(installment.id, amountRwf, phone);
      res.json({
        success: true,
        message: 'Check your phone to approve the Mobile Money payment.',
        status: result.status,
      });
    } catch (error: any) {
      console.error('Public pay-momo error:', error);
      res.status(400).json({ error: error.message || 'Failed to initiate payment' });
    }
  }
);

export default router;
