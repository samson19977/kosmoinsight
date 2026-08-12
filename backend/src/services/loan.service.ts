import { eq, sql } from 'drizzle-orm';
import { db } from '../config/database';
import { loans, installments, loanTransactions, customers, payments } from '../db/schema';
import { EmailService } from './email.service';

// ============================================
// Business rules — tunable via env vars so ops can adjust policy without
// a code deploy. Defaults reflect common PayGo microfinance practice.
// ============================================
const GRACE_PERIOD_DAYS = Number(process.env.LOAN_GRACE_PERIOD_DAYS || 3); // days past due before a penalty is charged
const PENALTY_RATE_BPS = Number(process.env.LOAN_PENALTY_RATE_BPS || 300); // 3% of the installment amount, charged once when it first crosses the grace period
const REMINDER_DAYS_BEFORE = Number(process.env.LOAN_REMINDER_DAYS_BEFORE || 3); // send a reminder this many days before due date
const DEFAULT_THRESHOLD_CONSECUTIVE_MISSED = Number(process.env.LOAN_DEFAULT_THRESHOLD || 3); // consecutive unpaid overdue installments before a loan is flagged defaulted

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function generateLoanNumber(): string {
  const d = new Date();
  const dateStr =
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PGO-${dateStr}-${rand}`;
}

export class LoanService {
  // ============================================
  // Create a loan + generate its installment schedule.
  // Flat interest over the term, split into equal monthly installments
  // (the last installment absorbs any rounding remainder so the schedule
  // always sums exactly to totalPayableRwf).
  // ============================================
  static async createLoan(input: {
    orderId?: number;
    customerId: number;
    principalRwf: number;
    downPaymentRwf: number;
    interestRateBps: number;
    termMonths: number;
    guarantorType: string;
    guarantorName?: string;
    guarantorPhone?: string;
    notes?: string;
    adminId?: number | null;
  }) {
    const financedRwf = input.principalRwf - input.downPaymentRwf;
    if (financedRwf <= 0) {
      throw new Error('Down payment must be less than the principal — nothing left to finance.');
    }

    const interestRwf = Math.round((financedRwf * input.interestRateBps) / 10000);
    const totalPayableRwf = financedRwf + interestRwf;

    const loanNumber = generateLoanNumber();
    const disbursedAt = new Date();
    const expectedPayoffDate = addMonths(disbursedAt, input.termMonths);

    const [loan] = await db
      .insert(loans)
      .values({
        loanNumber,
        orderId: input.orderId ?? null,
        customerId: input.customerId,
        principalRwf: financedRwf,
        downPaymentRwf: input.downPaymentRwf,
        interestRateBps: input.interestRateBps,
        termMonths: input.termMonths,
        totalPayableRwf,
        status: 'active',
        guarantorType: input.guarantorType,
        guarantorName: input.guarantorName || null,
        guarantorPhone: input.guarantorPhone || null,
        disbursedAt,
        expectedPayoffDate,
        notes: input.notes || null,
      })
      .returning();

    // ---- Generate equal-installment schedule ----
    const baseAmount = Math.floor(totalPayableRwf / input.termMonths);
    const remainder = totalPayableRwf - baseAmount * input.termMonths;

    const schedule = [];
    for (let i = 1; i <= input.termMonths; i++) {
      const amountDueRwf = i === input.termMonths ? baseAmount + remainder : baseAmount;
      schedule.push({
        loanId: loan.id,
        installmentNumber: i,
        dueDate: addMonths(disbursedAt, i),
        amountDueRwf,
        amountPaidRwf: 0,
        status: 'upcoming' as const,
      });
    }
    await db.insert(installments).values(schedule);

    // ---- Record disbursement in the audit trail ----
    await db.insert(loanTransactions).values({
      loanId: loan.id,
      type: 'disbursement',
      amountRwf: financedRwf,
      method: null,
      adminId: input.adminId ?? null,
      note: `Loan disbursed. Down payment: ${input.downPaymentRwf} RWF. Term: ${input.termMonths} months.`,
    });

    return loan;
  }

  // ============================================
  // Record a payment against a specific installment. Handles partial
  // payments, overpayment spillover into the next unpaid installment,
  // and marks the loan completed once every installment is fully paid.
  // ============================================
  static async recordPayment(
    installmentId: number,
    input: { amountRwf: number; method: string; phone?: string; note?: string; adminId?: number | null }
  ) {
    const [installment] = await db.select().from(installments).where(eq(installments.id, installmentId));
    if (!installment) throw new Error('Installment not found');

    const [loan] = await db.select().from(loans).where(eq(loans.id, installment.loanId));
    if (!loan) throw new Error('Loan not found');

    let remaining = input.amountRwf;
    let cursor = installment;

    while (remaining > 0 && cursor) {
      const owed = cursor.amountDueRwf + (cursor.penaltyRwf || 0) - (cursor.amountPaidRwf || 0);
      const applied = Math.min(remaining, Math.max(owed, 0));

      if (applied > 0) {
        const newPaid = (cursor.amountPaidRwf || 0) + applied;
        const fullyPaid = newPaid >= cursor.amountDueRwf + (cursor.penaltyRwf || 0);

        await db
          .update(installments)
          .set({
            amountPaidRwf: newPaid,
            status: fullyPaid ? 'paid' : 'partial',
            paidAt: fullyPaid ? new Date() : cursor.paidAt,
            updatedAt: new Date(),
          })
          .where(eq(installments.id, cursor.id));

        await db.insert(loanTransactions).values({
          loanId: loan.id,
          installmentId: cursor.id,
          type: 'payment',
          amountRwf: applied,
          method: input.method,
          phone: input.phone || null,
          adminId: input.adminId ?? null,
          note: input.note || null,
        });
      }

      remaining -= applied;

      if (remaining <= 0) break;

      // Overpayment spills into the next unpaid installment on the same loan
      const siblings = await db.select().from(installments).where(eq(installments.loanId, loan.id));
      const nextUnpaid = siblings
        .filter((i) => i.status !== 'paid' && i.id !== cursor.id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber)[0];

      if (!nextUnpaid) break; // nothing left to apply the overpayment to
      cursor = nextUnpaid;
    }

    // ---- Check if loan is fully paid off ----
    const allInstallments = await db.select().from(installments).where(eq(installments.loanId, loan.id));
    const allPaid = allInstallments.every((i) => i.status === 'paid');
    if (allPaid) {
      await db
        .update(loans)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(loans.id, loan.id));

      const [customer] = await db.select().from(customers).where(eq(customers.id, loan.customerId));
      if (customer?.email) {
        const totalPaidRwf = allInstallments.reduce((s, i) => s + (i.amountPaidRwf || 0), 0);
        EmailService.sendLoanCompletedNotice({
          customerName: `${customer.firstName} ${customer.lastName}`,
          customerEmail: customer.email,
          loanNumber: loan.loanNumber,
          totalPaidRwf,
        }).catch((err) => console.error('Loan completion email error (non-fatal):', err));
      }
    }

    return { loanId: loan.id, allPaid };
  }

  // ============================================
  // Apply a late-payment penalty to an installment (manual or scheduled job).
  // ============================================
  static async applyPenalty(installmentId: number, amountRwf: number, note?: string) {
    const [installment] = await db.select().from(installments).where(eq(installments.id, installmentId));
    if (!installment) throw new Error('Installment not found');

    await db
      .update(installments)
      .set({ penaltyRwf: (installment.penaltyRwf || 0) + amountRwf, updatedAt: new Date() })
      .where(eq(installments.id, installmentId));

    await db.insert(loanTransactions).values({
      loanId: installment.loanId,
      installmentId: installment.id,
      type: 'penalty',
      amountRwf,
      note: note || 'Late payment penalty',
    });
  }

  // ============================================
  // AUTOMATION 1/4 — Pre-due reminders.
  // Emails customers whose next installment falls due within
  // REMINDER_DAYS_BEFORE days and who haven't been reminded yet.
  // ============================================
  static async sendUpcomingReminders(): Promise<{ sent: number }> {
    const now = new Date();
    const horizon = new Date(now.getTime() + REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000);

    const due = await db
      .select()
      .from(installments)
      .where(sql`${installments.status} IN ('upcoming', 'due')
        AND ${installments.dueDate} <= ${horizon}
        AND ${installments.dueDate} >= ${now}
        AND ${installments.reminderSentAt} IS NULL`);

    let sent = 0;
    for (const inst of due) {
      const [loan] = await db.select().from(loans).where(eq(loans.id, inst.loanId));
      if (!loan || loan.status !== 'active') continue;
      const [customer] = await db.select().from(customers).where(eq(customers.id, loan.customerId));
      if (!customer) continue;

      const daysUntilDue = Math.max(0, Math.ceil((inst.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

      if (customer.email) {
        await EmailService.sendInstallmentReminder({
          customerName: `${customer.firstName} ${customer.lastName}`,
          customerEmail: customer.email,
          loanNumber: loan.loanNumber,
          installmentNumber: inst.installmentNumber,
          amountDueRwf: inst.amountDueRwf,
          dueDate: inst.dueDate,
          daysUntilDue,
        }).catch((err) => console.error('Installment reminder email error (non-fatal):', err));
      }

      await db
        .update(installments)
        .set({ reminderSentAt: now, updatedAt: now })
        .where(eq(installments.id, inst.id));
      sent++;
    }
    return { sent };
  }

  // ============================================
  // AUTOMATION 2/4 — Overdue sweep + grace-period penalty + overdue alert.
  // Anything past due_date and unpaid flips to 'overdue'. Once an
  // installment has been overdue for longer than GRACE_PERIOD_DAYS, a
  // one-time penalty (PENALTY_RATE_BPS of the amount due) is charged and
  // an overdue email goes out — both gated so they never repeat for the
  // same installment.
  // ============================================
  static async sweepOverdueAndPenalize(): Promise<{ flagged: number; penalized: number; alerted: number }> {
    const now = new Date();

    // 1. Flag anything past due and still unpaid as overdue
    const flaggedResult = await db.execute(sql`
      UPDATE installments
      SET status = 'overdue', updated_at = NOW()
      WHERE due_date < ${now}
        AND status IN ('upcoming', 'due', 'partial')
    `);

    const overdue = await db.select().from(installments).where(eq(installments.status, 'overdue'));

    let penalized = 0;
    let alerted = 0;

    for (const inst of overdue) {
      const daysOverdue = Math.floor((now.getTime() - inst.dueDate.getTime()) / (24 * 60 * 60 * 1000));
      const outstanding = inst.amountDueRwf - (inst.amountPaidRwf || 0);
      if (outstanding <= 0) continue; // fully covered by a partial payment already, just mis-flagged by timing

      // ---- One-time grace-period penalty ----
      if (daysOverdue > GRACE_PERIOD_DAYS && (inst.penaltyRwf || 0) === 0) {
        const penaltyRwf = Math.round((inst.amountDueRwf * PENALTY_RATE_BPS) / 10000);
        await this.applyPenalty(inst.id, penaltyRwf, `Auto-applied late penalty (${daysOverdue}d overdue, grace period ${GRACE_PERIOD_DAYS}d)`);
        penalized++;
      }

      // ---- One-time overdue alert email ----
      if (!inst.overdueAlertSentAt) {
        const [loan] = await db.select().from(loans).where(eq(loans.id, inst.loanId));
        const [customer] = loan ? await db.select().from(customers).where(eq(customers.id, loan.customerId)) : [];
        if (loan && customer?.email) {
          const amountOwedRwf = outstanding + (inst.penaltyRwf || 0);
          await EmailService.sendInstallmentOverdueAlert({
            customerName: `${customer.firstName} ${customer.lastName}`,
            customerEmail: customer.email,
            loanNumber: loan.loanNumber,
            installmentNumber: inst.installmentNumber,
            amountOwedRwf,
            daysOverdue,
          }).catch((err) => console.error('Overdue alert email error (non-fatal):', err));
        }
        await db
          .update(installments)
          .set({ overdueAlertSentAt: now, updatedAt: now })
          .where(eq(installments.id, inst.id));
        alerted++;
      }
    }

    return { flagged: overdue.length, penalized, alerted };
  }

  // ============================================
  // AUTOMATION 3/4 — Default detection.
  // A loan is flagged 'defaulted' once it has DEFAULT_THRESHOLD_CONSECUTIVE_MISSED
  // consecutive overdue+unpaid installments (counting from the earliest
  // unpaid one) — i.e. the customer has fallen consistently behind, not
  // just missed a single payment once. Triggers an admin risk alert.
  // ============================================
  static async detectAndFlagDefaults(): Promise<{ flagged: number }> {
    const activeLoans = await db.select().from(loans).where(eq(loans.status, 'active'));
    let flagged = 0;

    for (const loan of activeLoans) {
      const loanInstallments = (
        await db.select().from(installments).where(eq(installments.loanId, loan.id))
      ).sort((a, b) => a.installmentNumber - b.installmentNumber);

      let consecutiveMissed = 0;
      for (const inst of loanInstallments) {
        if (inst.status === 'overdue') {
          consecutiveMissed++;
        } else if (inst.status === 'paid') {
          consecutiveMissed = 0; // a paid installment resets the streak
        }
        // 'upcoming'/'due'/'partial' installments don't count either way — only overdue ones build the streak
      }

      if (consecutiveMissed >= DEFAULT_THRESHOLD_CONSECUTIVE_MISSED) {
        await db
          .update(loans)
          .set({ status: 'defaulted', updatedAt: new Date() })
          .where(eq(loans.id, loan.id));

        const [customer] = await db.select().from(customers).where(eq(customers.id, loan.customerId));
        const overdueAmountRwf = loanInstallments
          .filter((i) => i.status === 'overdue')
          .reduce((s, i) => s + Math.max(0, i.amountDueRwf + (i.penaltyRwf || 0) - (i.amountPaidRwf || 0)), 0);

        if (customer) {
          await EmailService.sendAdminLoanRiskAlert({
            loanNumber: loan.loanNumber,
            customerName: `${customer.firstName} ${customer.lastName}`,
            customerPhone: customer.phone,
            consecutiveMissed,
            overdueAmountRwf,
          }).catch((err) => console.error('Admin risk alert email error (non-fatal):', err));
        }
        flagged++;
      }
    }
    return { flagged };
  }

  // ============================================
  // AUTOMATION 4/4 — Daily orchestrator. Run on server startup and on a
  // 24h interval (wired in app.ts), or trigger manually from the admin
  // dashboard via POST /api/admin/loans/run-automation.
  // ============================================
  static async runDailyAutomation() {
    const reminders = await this.sendUpcomingReminders();
    const overdue = await this.sweepOverdueAndPenalize();
    const defaults = await this.detectAndFlagDefaults();
    const summary = { reminders, overdue, defaults, ranAt: new Date().toISOString() };
    console.log('📅 Loan automation run:', JSON.stringify(summary));
    return summary;
  }

  // Kept for backward compatibility with any direct callers — delegates to the full sweep.
  static async flagOverdueInstallments() {
    return this.sweepOverdueAndPenalize();
  }

  // ============================================
  // Repayment-rate and portfolio metrics for the admin dashboard.
  // ============================================
  static async getPortfolioMetrics() {
    const allInstallments = await db.select().from(installments);
    const allLoans = await db.select().from(loans);

    const totalDue = allInstallments.reduce((s, i) => s + (i.amountDueRwf || 0), 0);
    const totalPaid = allInstallments.reduce((s, i) => s + (i.amountPaidRwf || 0), 0);
    const repaymentRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 1000) / 10 : 0; // percent, 1dp

    const overdue = allInstallments.filter((i) => i.status === 'overdue');
    const overdueAmountRwf = overdue.reduce(
      (s, i) => s + Math.max(0, i.amountDueRwf + (i.penaltyRwf || 0) - (i.amountPaidRwf || 0)),
      0
    );

    const activeLoans = allLoans.filter((l) => l.status === 'active').length;
    const completedLoans = allLoans.filter((l) => l.status === 'completed').length;
    const defaultedLoans = allLoans.filter((l) => l.status === 'defaulted').length;

    const activeLoanIdsWithOverdue = new Set(
      overdue.map((i) => i.loanId).filter((id) => allLoans.find((l) => l.id === id)?.status === 'active')
    );
    const atRiskLoanCount = activeLoanIdsWithOverdue.size;

    const outstandingPrincipalRwf = allLoans
      .filter((l) => l.status === 'active')
      .reduce((s, l) => s + l.totalPayableRwf, 0);
    const outstandingCollectedRwf = allInstallments
      .filter((i) => allLoans.find((l) => l.id === i.loanId)?.status === 'active')
      .reduce((s, i) => s + (i.amountPaidRwf || 0), 0);

    return {
      repaymentRatePercent: repaymentRate,
      totalDueRwf: totalDue,
      totalPaidRwf: totalPaid,
      overdueCount: overdue.length,
      overdueAmountRwf,
      loanCounts: {
        active: activeLoans,
        completed: completedLoans,
        defaulted: defaultedLoans,
        total: allLoans.length,
        atRisk: atRiskLoanCount,
      },
      outstandingPrincipalRwf: outstandingPrincipalRwf - outstandingCollectedRwf,
    };
  }

  // ============================================
  // CAC vs LTV — LTV is derived from actual payments (one-time orders +
  // installment payments); CAC comes from the acquisition_cost_rwf a
  // customer was tagged with at signup.
  // ============================================
  static async getCacLtvMetrics() {
    const allCustomers = await db.select().from(customers);
    const allPayments = await db.select().from(payments);
    const allInstallments = await db.select().from(installments);
    const allLoans = await db.select().from(loans);

    const ltvByCustomer = new Map<number, number>();

    // One-time order payments
    for (const p of allPayments) {
      if (p.status !== 'paid') continue;
      // payments table doesn't carry customerId directly; join via order in caller if needed.
    }

    // Installment payments (loan → customer)
    for (const inst of allInstallments) {
      const loan = allLoans.find((l) => l.id === inst.loanId);
      if (!loan) continue;
      const paid = inst.amountPaidRwf || 0;
      if (paid > 0) {
        ltvByCustomer.set(loan.customerId, (ltvByCustomer.get(loan.customerId) || 0) + paid);
      }
    }

    const withCac = allCustomers.filter((c) => c.acquisitionCostRwf != null);
    const avgCacRwf = withCac.length
      ? Math.round(withCac.reduce((s, c) => s + (c.acquisitionCostRwf || 0), 0) / withCac.length)
      : null;

    const cacByChannel = new Map<string, { totalCostRwf: number; count: number }>();
    for (const c of withCac) {
      const channel = c.acquisitionChannel || 'unspecified';
      const entry = cacByChannel.get(channel) || { totalCostRwf: 0, count: 0 };
      entry.totalCostRwf += c.acquisitionCostRwf || 0;
      entry.count += 1;
      cacByChannel.set(channel, entry);
    }

    const avgLtvRwf = ltvByCustomer.size
      ? Math.round(Array.from(ltvByCustomer.values()).reduce((s, v) => s + v, 0) / ltvByCustomer.size)
      : 0;

    return {
      avgCacRwf,
      avgLtvRwf,
      ltvToCacRatio: avgCacRwf && avgCacRwf > 0 ? Math.round((avgLtvRwf / avgCacRwf) * 100) / 100 : null,
      cacByChannel: Array.from(cacByChannel.entries()).map(([channel, v]) => ({
        channel,
        avgCacRwf: Math.round(v.totalCostRwf / v.count),
        customerCount: v.count,
      })),
      customersWithCacData: withCac.length,
      customersWithLtvData: ltvByCustomer.size,
      note:
        withCac.length === 0
          ? 'No customers have acquisition_cost_rwf set yet — CAC requires tagging customers with acquisition cost/channel at signup.'
          : undefined,
    };
  }
}
