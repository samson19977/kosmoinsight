import { eq, sql, and, inArray, asc } from 'drizzle-orm';
import { db } from '../config/database';
import { loans, installments, loanTransactions, customers, payments, orders } from '../db/schema';
import type { LoanInput } from '../lib/validation/schemas';
import { MomoService } from './momo.service';

// Default penalty applied to an installment once it goes overdue.
// Kept as a flat rate rather than compounding daily interest, matching
// the JD's "penalty rules" ask in the simplest defensible form; tune later.
const DEFAULT_PENALTY_RATE_BPS = 500; // 5% of the missed installment amount

// Business rules — tune here as Kosmotive's collections policy evolves.
const RULES = {
  // Days before due date an 'upcoming' installment becomes 'due' and
  // starts showing up in collection prompts / reminders.
  DUE_REMINDER_DAYS: 3,
  // Consecutive overdue installments on a loan before it's auto-flagged 'defaulted'.
  DEFAULT_AFTER_OVERDUE_COUNT: 3,
  // How long a MoMo request-to-pay is left pending before it's treated as failed/expired.
  MOMO_PENDING_TIMEOUT_MINUTES: 30,
};

export class LoanService {
  // ==========================================================
  // Create a loan + generate its full installment schedule in
  // one transaction. Interest is applied flat across the term
  // (principal + principal * rate) / termMonths — simple and
  // auditable, not amortized — matching how most PayGo/microfinance
  // pilots in this space communicate repayment amounts to customers.
  // ==========================================================
  static async createLoanWithSchedule(input: LoanInput) {
    return db.transaction(async (tx) => {
      const startDate = input.startDate ? new Date(input.startDate) : new Date();

      const totalInterestRwf = Math.round((input.principalRwf * input.interestRateBps) / 10000);
      const totalRepayableRwf = input.principalRwf + totalInterestRwf;
      const perInstallmentRwf = Math.round(totalRepayableRwf / input.termMonths);

      const expectedPayoffDate = new Date(startDate);
      expectedPayoffDate.setMonth(expectedPayoffDate.getMonth() + input.termMonths);

      const [loan] = await tx
        .insert(loans)
        .values({
          orderId: input.orderId,
          customerId: input.customerId,
          principalRwf: input.principalRwf,
          downPaymentRwf: input.downPaymentRwf ?? 0,
          interestRateBps: input.interestRateBps ?? 0,
          termMonths: input.termMonths,
          status: 'active',
          guarantorName: input.guarantorName || null,
          guarantorPhone: input.guarantorPhone || null,
          acquisitionChannel: input.acquisitionChannel || null,
          startDate,
          expectedPayoffDate,
        })
        .returning();

      // Build the schedule. Any rounding remainder from the division above
      // is absorbed into the final installment so the sum always equals
      // totalRepayableRwf exactly (no silent under/over-billing).
      const scheduleRows = [];
      let allocated = 0;
      for (let i = 1; i <= input.termMonths; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);

        const isLast = i === input.termMonths;
        const amountDueRwf = isLast ? totalRepayableRwf - allocated : perInstallmentRwf;
        allocated += amountDueRwf;

        scheduleRows.push({
          loanId: loan.id,
          installmentNumber: i,
          dueDate,
          amountDueRwf,
          status: 'upcoming' as const,
        });
      }

      const createdInstallments = await tx.insert(installments).values(scheduleRows).returning();

      // Record the disbursement itself as the first ledger entry, so the
      // loan_transactions table tells the full story from day one.
      await tx.insert(loanTransactions).values({
        loanId: loan.id,
        type: 'disbursement',
        amountRwf: input.principalRwf,
        status: 'completed',
        note: `Loan disbursed. ${input.termMonths} installments of ~${perInstallmentRwf} RWF scheduled.`,
      });

      return { loan, installments: createdInstallments };
    });
  }

  // ==========================================================
  // CORE AUTO-ALLOCATION ENGINE
  // Applies a single payment amount against a loan, waterfalling it
  // across outstanding installments oldest-due-first. Handles the
  // "pay all" case (one payment clears several installments) and the
  // "pay partially" case (payment is less than one installment's
  // balance) with the same code path — this is what both the admin's
  // manual cash/bank entry screen and the automated MoMo reconciliation
  // job call, so the business rule only lives in one place.
  // ==========================================================
  static async recordLoanPayment(params: {
    loanId: number;
    amountRwf: number;
    paymentMethod: 'momo' | 'cash' | 'bank';
    momoTransactionId?: string;
    adminId?: number;
    note?: string;
  }) {
    return db.transaction(async (tx) => {
      const [loan] = await tx.select().from(loans).where(eq(loans.id, params.loanId));
      if (!loan) throw new Error(`Loan ${params.loanId} not found`);

      const outstanding = await tx
        .select()
        .from(installments)
        .where(and(eq(installments.loanId, params.loanId), sql`${installments.status} != 'paid'`))
        .orderBy(asc(installments.installmentNumber));

      let remaining = params.amountRwf;
      const touched: Array<{ installmentId: number; installmentNumber: number; appliedRwf: number; status: string }> = [];
      const now = new Date();

      for (const inst of outstanding) {
        if (remaining <= 0) break;

        const owed = inst.amountDueRwf + inst.penaltyRwf - inst.amountPaidRwf;
        if (owed <= 0) continue;

        const applied = Math.min(remaining, owed);
        const newAmountPaid = inst.amountPaidRwf + applied;
        const isFullyPaid = newAmountPaid >= inst.amountDueRwf + inst.penaltyRwf;

        const [updated] = await tx
          .update(installments)
          .set({
            amountPaidRwf: newAmountPaid,
            status: isFullyPaid ? 'paid' : inst.status === 'upcoming' ? 'due' : inst.status,
            paidAt: isFullyPaid ? now : inst.paidAt,
            updatedAt: now,
          })
          .where(eq(installments.id, inst.id))
          .returning();

        await tx.insert(loanTransactions).values({
          loanId: params.loanId,
          installmentId: inst.id,
          type: 'payment',
          amountRwf: applied,
          paymentMethod: params.paymentMethod,
          momoTransactionId: params.momoTransactionId || null,
          status: 'completed',
          adminId: params.adminId || null,
          note: params.note || null,
        });

        touched.push({ installmentId: updated.id, installmentNumber: updated.installmentNumber, appliedRwf: applied, status: updated.status });
        remaining -= applied;
      }

      // Any leftover after every outstanding installment is cleared is an
      // overpayment — logged explicitly rather than silently discarded, so
      // it's visible to an admin as a credit to reconcile or refund.
      if (remaining > 0) {
        await tx.insert(loanTransactions).values({
          loanId: params.loanId,
          type: 'payment',
          amountRwf: remaining,
          paymentMethod: params.paymentMethod,
          momoTransactionId: params.momoTransactionId || null,
          status: 'completed',
          adminId: params.adminId || null,
          note: `Overpayment credit — exceeds all outstanding installments by ${remaining} RWF. ${params.note || ''}`.trim(),
        });
      }

      const stillOutstanding = await tx
        .select()
        .from(installments)
        .where(and(eq(installments.loanId, params.loanId), sql`${installments.status} != 'paid'`));

      if (stillOutstanding.length === 0 && loan.status === 'active') {
        await tx
          .update(loans)
          .set({ status: 'completed', completedAt: now, updatedAt: now })
          .where(eq(loans.id, params.loanId));
      }

      return {
        loanId: params.loanId,
        amountAppliedRwf: params.amountRwf - remaining,
        overpaymentRwf: remaining,
        installmentsTouched: touched,
        loanCompleted: stillOutstanding.length === 0,
      };
    });
  }

  // ==========================================================
  // What does this loan currently owe? Used both to prompt a MoMo
  // collection with a sensible default amount and to show the
  // customer/admin a live "amount due today" figure.
  // payoffAll=true includes not-yet-due future installments too,
  // for an early full settlement.
  // ==========================================================
  static async getCollectibleAmount(loanId: number, payoffAll = false) {
    const rows = await db
      .select()
      .from(installments)
      .where(
        payoffAll
          ? and(eq(installments.loanId, loanId), sql`${installments.status} != 'paid'`)
          : and(eq(installments.loanId, loanId), inArray(installments.status, ['due', 'overdue']))
      );

    const amountRwf = rows.reduce((sum, r) => sum + (r.amountDueRwf + r.penaltyRwf - r.amountPaidRwf), 0);
    return { amountRwf: Math.max(0, amountRwf), installmentCount: rows.length };
  }

  // ==========================================================
  // Kick off a MoMo request-to-pay for a loan. Defaults to "what's
  // currently due" (due + overdue installments); pass amountRwf to
  // override, or payoffAll to request full early settlement.
  // Records a 'pending' loan_transaction — the background reconciler
  // (or a manual /reconcile call) flips it to completed/failed and,
  // on success, runs it through the same waterfall allocation as any
  // other payment.
  // ==========================================================
  static async initiateMomoCollection(params: { loanId: number; amountRwf?: number; payoffAll?: boolean; adminId?: number }) {
    const [loan] = await db.select().from(loans).where(eq(loans.id, params.loanId));
    if (!loan) throw new Error(`Loan ${params.loanId} not found`);

    const [customer] = await db.select().from(customers).where(eq(customers.id, loan.customerId));
    if (!customer) throw new Error(`Customer ${loan.customerId} not found for loan ${params.loanId}`);

    let amountRwf = params.amountRwf;
    if (!amountRwf) {
      const collectible = await this.getCollectibleAmount(params.loanId, params.payoffAll ?? false);
      amountRwf = collectible.amountRwf;
    }
    if (amountRwf <= 0) {
      throw new Error('Nothing currently due on this loan');
    }

    const reference = `KOSMOLOAN-${loan.id}-${Date.now()}`;
    const result = await MomoService.initiatePayment({
      phone: customer.phone,
      amount: amountRwf,
      reference,
      description: `PayGo installment payment — Loan #${loan.id}`,
    });

    const [txn] = await db
      .insert(loanTransactions)
      .values({
        loanId: loan.id,
        type: 'payment',
        amountRwf,
        paymentMethod: 'momo',
        momoTransactionId: result.transactionId || reference,
        status: result.status === 'pending' || result.status === 'pending_manual' ? 'pending' : 'completed',
        adminId: params.adminId || null,
        note: result.message,
      })
      .returning();

    return { transaction: txn, momoResult: result };
  }

  // ==========================================================
  // Reconciliation job — checks every 'pending' MoMo loan_transaction
  // against MTN's status API. On SUCCESSFUL, runs the waterfall
  // allocation and marks the placeholder transaction completed. On
  // FAILED or timeout, marks it failed so it stops being retried
  // forever. Safe to call repeatedly (idempotent).
  // ==========================================================
  static async reconcilePendingMomoTransactions() {
    const pending = await db
      .select()
      .from(loanTransactions)
      .where(and(eq(loanTransactions.status, 'pending'), eq(loanTransactions.paymentMethod, 'momo')));

    let completed = 0;
    let failed = 0;
    let stillPending = 0;

    for (const txn of pending) {
      if (!txn.momoTransactionId) continue;

      const ageMinutes = (Date.now() - new Date(txn.createdAt!).getTime()) / 60000;
      const momoStatus = await MomoService.checkPaymentStatus(txn.momoTransactionId);

      if (momoStatus.status === 'SUCCESSFUL') {
        // Allocate the payment, then close out the placeholder row so it's
        // not picked up again — the allocation itself writes the real
        // per-installment ledger entries.
        await this.recordLoanPayment({
          loanId: txn.loanId,
          amountRwf: txn.amountRwf,
          paymentMethod: 'momo',
          momoTransactionId: txn.momoTransactionId,
          note: 'Auto-reconciled MoMo collection',
        });
        await db
          .update(loanTransactions)
          .set({ status: 'completed' })
          .where(eq(loanTransactions.id, txn.id));
        completed++;
      } else if (momoStatus.status === 'FAILED' || ageMinutes > RULES.MOMO_PENDING_TIMEOUT_MINUTES) {
        await db
          .update(loanTransactions)
          .set({ status: 'failed', note: `${txn.note || ''} — ${momoStatus.status === 'FAILED' ? 'declined by customer/MTN' : 'timed out awaiting approval'}`.trim() })
          .where(eq(loanTransactions.id, txn.id));
        failed++;
      } else {
        stillPending++;
      }
    }

    return { checked: pending.length, completed, failed, stillPending };
  }

  // ==========================================================
  // Record a payment against ONE specific installment. Kept for
  // precise manual admin correction (e.g. backdating a specific
  // month); general collections should use recordLoanPayment instead
  // so partial/overpayment waterfall logic applies consistently.
  // ==========================================================
  static async recordInstallmentPayment(params: {
    installmentId: number;
    amountRwf: number;
    paymentMethod: 'momo' | 'cash' | 'bank';
    momoTransactionId?: string;
    adminId?: number;
    note?: string;
  }) {
    return db.transaction(async (tx) => {
      const [installment] = await tx
        .select()
        .from(installments)
        .where(eq(installments.id, params.installmentId));

      if (!installment) {
        throw new Error(`Installment ${params.installmentId} not found`);
      }

      const now = new Date();
      const newAmountPaid = installment.amountPaidRwf + params.amountRwf;
      const isFullyPaid = newAmountPaid >= installment.amountDueRwf + installment.penaltyRwf;

      const [updatedInstallment] = await tx
        .update(installments)
        .set({
          amountPaidRwf: newAmountPaid,
          status: isFullyPaid ? 'paid' : installment.status === 'upcoming' ? 'due' : installment.status,
          paidAt: isFullyPaid ? now : installment.paidAt,
          updatedAt: now,
        })
        .where(eq(installments.id, installment.id))
        .returning();

      await tx.insert(loanTransactions).values({
        loanId: installment.loanId,
        installmentId: installment.id,
        type: 'payment',
        amountRwf: params.amountRwf,
        paymentMethod: params.paymentMethod,
        momoTransactionId: params.momoTransactionId || null,
        status: 'completed',
        adminId: params.adminId || null,
        note: params.note || null,
      });

      // If every installment on this loan is now paid, close the loan out.
      const remaining = await tx
        .select()
        .from(installments)
        .where(and(eq(installments.loanId, installment.loanId), sql`${installments.status} != 'paid'`));

      if (remaining.length === 0) {
        await tx
          .update(loans)
          .set({ status: 'completed', completedAt: now, updatedAt: now })
          .where(eq(loans.id, installment.loanId));
      }

      return updatedInstallment;
    });
  }

  // ==========================================================
  // Daily sweep — three business rules, run together and safe to
  // re-run (idempotent — only touches rows in the relevant state):
  //   1. 'upcoming' -> 'due' once within DUE_REMINDER_DAYS of due date
  //      (this is what should drive collection reminders).
  //   2. unpaid + past due date -> 'overdue' + flat penalty applied once.
  //   3. a loan with >= DEFAULT_AFTER_OVERDUE_COUNT overdue installments
  //      is auto-flagged 'defaulted' for portfolio-risk visibility.
  // Intended to be called from the background scheduler daily, or
  // manually from the dashboard.
  // ==========================================================
  static async applyOverduePenalties(referenceDate: Date = new Date()) {
    // Rule 1: activate upcoming installments approaching their due date.
    const reminderCutoff = new Date(referenceDate);
    reminderCutoff.setDate(reminderCutoff.getDate() + RULES.DUE_REMINDER_DAYS);

    const activated = await db
      .update(installments)
      .set({ status: 'due', updatedAt: new Date() })
      .where(and(eq(installments.status, 'upcoming'), sql`${installments.dueDate} <= ${reminderCutoff}`))
      .returning({ id: installments.id });

    // Rule 2: flag overdue + apply the one-time flat penalty.
    const overdueCandidates = await db
      .select()
      .from(installments)
      .where(
        and(
          inArray(installments.status, ['upcoming', 'due']),
          sql`${installments.dueDate} < ${referenceDate}`
        )
      );

    let flagged = 0;
    for (const inst of overdueCandidates) {
      const remainingDue = inst.amountDueRwf - inst.amountPaidRwf;
      if (remainingDue <= 0) continue; // already effectively paid, status will settle on next payment write

      const penalty = inst.penaltyRwf > 0
        ? inst.penaltyRwf // don't re-penalize an already-flagged installment
        : Math.round((remainingDue * DEFAULT_PENALTY_RATE_BPS) / 10000);

      await db
        .update(installments)
        .set({ status: 'overdue', penaltyRwf: penalty, updatedAt: new Date() })
        .where(eq(installments.id, inst.id));

      if (inst.penaltyRwf === 0 && penalty > 0) {
        await db.insert(loanTransactions).values({
          loanId: inst.loanId,
          installmentId: inst.id,
          type: 'penalty',
          amountRwf: penalty,
          status: 'completed',
          note: `Auto-applied late penalty (${DEFAULT_PENALTY_RATE_BPS / 100}% of ${remainingDue} RWF remaining).`,
        });
      }
      flagged++;
    }

    // Rule 3: auto-default loans with too many overdue installments.
    const overdueCounts = await db
      .select({ loanId: installments.loanId, count: sql<number>`COUNT(*)` })
      .from(installments)
      .where(eq(installments.status, 'overdue'))
      .groupBy(installments.loanId);

    let defaulted = 0;
    for (const row of overdueCounts) {
      if (Number(row.count) < RULES.DEFAULT_AFTER_OVERDUE_COUNT) continue;
      const [loan] = await db.select().from(loans).where(eq(loans.id, row.loanId));
      if (!loan || loan.status !== 'active') continue;

      await db
        .update(loans)
        .set({ status: 'defaulted', updatedAt: new Date() })
        .where(eq(loans.id, row.loanId));

      await db.insert(loanTransactions).values({
        loanId: row.loanId,
        type: 'waiver', // reusing the ledger as a flag row; note carries the real meaning
        amountRwf: 0,
        status: 'completed',
        note: `Auto-flagged defaulted: ${row.count} overdue installments (threshold ${RULES.DEFAULT_AFTER_OVERDUE_COUNT}).`,
      });
      defaulted++;
    }

    return { activated: activated.length, checked: overdueCandidates.length, flagged, defaulted };
  }

  // ==========================================================
  // Repayment rate — the JD's headline metric. Direct aggregate
  // query against installments; no ledger reconstruction needed.
  // Optionally scoped to a single loan, or a district (via customers).
  // ==========================================================
  static async getRepaymentRate(params?: { loanId?: number; district?: string }) {
    let query = db
      .select({
        totalDueRwf: sql<number>`COALESCE(SUM(${installments.amountDueRwf}), 0)`,
        totalPaidRwf: sql<number>`COALESCE(SUM(${installments.amountPaidRwf}), 0)`,
        installmentCount: sql<number>`COUNT(*)`,
        paidCount: sql<number>`COUNT(*) FILTER (WHERE ${installments.status} = 'paid')`,
        overdueCount: sql<number>`COUNT(*) FILTER (WHERE ${installments.status} = 'overdue')`,
      })
      .from(installments)
      .innerJoin(loans, eq(installments.loanId, loans.id))
      .innerJoin(customers, eq(loans.customerId, customers.id))
      .$dynamic();

    const conditions = [];
    if (params?.loanId) conditions.push(eq(loans.id, params.loanId));
    if (params?.district) conditions.push(eq(customers.district, params.district));
    if (conditions.length > 0) query = query.where(and(...conditions));

    const [row] = await query;

    const totalDueRwf = Number(row?.totalDueRwf ?? 0);
    const totalPaidRwf = Number(row?.totalPaidRwf ?? 0);

    return {
      totalDueRwf,
      totalPaidRwf,
      repaymentRate: totalDueRwf > 0 ? Number((totalPaidRwf / totalDueRwf).toFixed(4)) : 0,
      installmentCount: Number(row?.installmentCount ?? 0),
      paidCount: Number(row?.paidCount ?? 0),
      overdueCount: Number(row?.overdueCount ?? 0),
    };
  }

  // ==========================================================
  // CAC / LTV — LTV derived from actual payments + installment
  // collections per customer; CAC pulled from the acquisition_cost_rwf
  // input on customers (a business input, not something derivable
  // from transaction data alone).
  // ==========================================================
  static async getCacLtvMetrics(params?: { channel?: string }) {
    let ltvQuery = db
      .select({
        customerId: customers.id,
        channel: customers.acquisitionChannel,
        acquisitionCostRwf: customers.acquisitionCostRwf,
        orderPaymentsRwf: sql<number>`COALESCE((
          SELECT SUM(${payments.amountRwf})
          FROM ${payments}
          INNER JOIN ${orders} ON ${orders.id} = ${payments.orderId}
          WHERE ${orders.customerId} = ${customers.id} AND ${payments.status} = 'paid'
        ), 0)`,
        installmentPaymentsRwf: sql<number>`COALESCE((
          SELECT SUM(${installments.amountPaidRwf})
          FROM ${installments}
          INNER JOIN ${loans} ON ${loans.id} = ${installments.loanId}
          WHERE ${loans.customerId} = ${customers.id}
        ), 0)`,
      })
      .from(customers)
      .$dynamic();

    if (params?.channel) {
      ltvQuery = ltvQuery.where(eq(customers.acquisitionChannel, params.channel));
    }

    const rows = await ltvQuery;

    const perCustomer = rows.map((r) => ({
      customerId: r.customerId,
      channel: r.channel,
      acquisitionCostRwf: r.acquisitionCostRwf,
      ltvRwf: Number(r.orderPaymentsRwf) + Number(r.installmentPaymentsRwf),
    }));

    const withCost = perCustomer.filter((c) => c.acquisitionCostRwf != null);
    const totalCac = withCost.reduce((sum, c) => sum + (c.acquisitionCostRwf ?? 0), 0);
    const totalLtv = perCustomer.reduce((sum, c) => sum + c.ltvRwf, 0);

    return {
      customerCount: perCustomer.length,
      customersWithCostData: withCost.length,
      avgCacRwf: withCost.length > 0 ? Math.round(totalCac / withCost.length) : null,
      avgLtvRwf: perCustomer.length > 0 ? Math.round(totalLtv / perCustomer.length) : 0,
      ltvToCacRatio:
        withCost.length > 0 && totalCac > 0
          ? Number(((totalLtv / perCustomer.length) / (totalCac / withCost.length)).toFixed(2))
          : null,
      perCustomer,
    };
  }

  // ==========================================================
  // Loan detail — loan + installment schedule + transaction log,
  // for a single loan detail view in the admin dashboard.
  // ==========================================================
  static async getLoanDetail(loanId: number) {
    const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
    if (!loan) return null;

    const schedule = await db
      .select()
      .from(installments)
      .where(eq(installments.loanId, loanId))
      .orderBy(installments.installmentNumber);

    const transactions = await db
      .select()
      .from(loanTransactions)
      .where(eq(loanTransactions.loanId, loanId))
      .orderBy(loanTransactions.createdAt);

    return { loan, schedule, transactions };
  }
}
