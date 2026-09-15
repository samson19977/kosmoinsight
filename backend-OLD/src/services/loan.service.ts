import { eq, sql, inArray } from 'drizzle-orm';
import { db, DbClient } from '../config/database';
import { loans, installments, loanTransactions, customers, payments, loanAgreements, orders, agents, agentCommissions } from '../db/schema';
import { EmailService } from './email.service';
import { MomoService } from './momo.service';
import { LedgerService } from './ledger.service';
import { SmsService } from './sms.service';

// A dedicated error type for both PayGo blocking rules (own-loan and
// identity-based) — lets callers detect "this failed because of the
// sequencing rule" reliably via instanceof, instead of pattern-matching
// on the error message text (which is fragile and breaks silently the
// next time the message wording changes for clarity or security reasons).
export class PayGoSequencingBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayGoSequencingBlockError';
  }
}

// ============================================
// Business rules — tunable via env vars so ops can adjust policy without
// a code deploy. Defaults reflect common PayGo microfinance practice.
// ============================================
const GRACE_PERIOD_DAYS = Number(process.env.LOAN_GRACE_PERIOD_DAYS || 3); // days past due before a penalty is charged
const PENALTY_RATE_BPS = Number(process.env.LOAN_PENALTY_RATE_BPS || 300); // 3% of the installment amount, charged once when it first crosses the grace period
const REMINDER_DAYS_BEFORE = Number(process.env.LOAN_REMINDER_DAYS_BEFORE || 3); // send a reminder this many days before due date
const DEFAULT_THRESHOLD_CONSECUTIVE_MISSED = Number(process.env.LOAN_DEFAULT_THRESHOLD || 3); // consecutive unpaid overdue installments before a loan is flagged defaulted
const MOMO_PENDING_TIMEOUT_MINUTES = Number(process.env.MOMO_PENDING_TIMEOUT_MINUTES || 20); // how long a Request-to-Pay can sit unresolved before we let the customer retry

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
    // Proof of the customer's explicit PayGo acceptance — required for
    // loans opened through the storefront/USSD/agent checkout flow
    // (validated upstream in orderSchema/agentOrderSchema); left undefined
    // when a loan is opened directly by an admin via /api/admin/loans,
    // where the admin dashboard itself is the record of who initiated it.
    agreement?: {
      agentId?: number | null;
      termsVersion?: string;
      ipAddress?: string;
      userAgent?: string;
    };
    // Lets a caller that already has its own open transaction (e.g.
    // createOrderCore, which needs the order row and the loan to commit
    // or roll back TOGETHER — an order shouldn't survive as an orphaned
    // "pending" record if the loan request gets rejected) pass that
    // transaction handle in, instead of this method opening a second,
    // unrelated one. Standalone callers (the admin "create loan" route,
    // the seed script) simply omit this and get the original
    // self-contained-transaction behavior.
    client?: DbClient;
  }) {
    const financedRwf = input.principalRwf - input.downPaymentRwf;
    if (financedRwf <= 0) {
      throw new Error('Down payment must be less than the principal — nothing left to finance.');
    }

    const loanNumber = generateLoanNumber();
    const disbursedAt = new Date();
    const expectedPayoffDate = addMonths(disbursedAt, input.termMonths);
    const interestRwf = Math.round((financedRwf * input.interestRateBps) / 10000);
    const totalPayableRwf = financedRwf + interestRwf;

    // Everything below runs as ONE transaction, for two reasons:
    //
    // 1. Race-safety on the sequencing rule: "SELECT ... FOR UPDATE" takes
    //    a row lock on this customer's existing loans for the duration of
    //    the transaction. Without it, two near-simultaneous requests to
    //    open a loan for the same customer (e.g. a slow client double
    //    submit, or two different channels racing) could BOTH read "no
    //    active loan yet" before either INSERT completes, and both would
    //    pass the check — silently violating the one-active-loan-at-a-time
    //    rule this method exists to enforce. The lock forces the second
    //    request to wait until the first transaction commits (at which
    //    point it re-reads and correctly sees the just-created loan).
    //
    // 2. Atomicity across steps: the loan row, its installment schedule,
    //    the disbursement audit entry, and the agreement record are four
    //    separate inserts. A crash partway through used to risk a loan
    //    that exists with no installment schedule, or a disbursed loan
    //    with no audit trail entry — exactly the kind of half-written
    //    financial state this rewrite is meant to eliminate everywhere.
    const runInTransaction = async (tx: DbClient) => {
      // ---- National ID required to open any PayGo plan ----
      // This is the ONE place every loan-creation path funnels through
      // (storefront/agent/USSD via createOrderCore, and the admin's own
      // direct "New Loan" form) — so it's the correct single chokepoint
      // for this rule, rather than checking it separately in each
      // caller. A previous version of this check lived only in
      // createOrderCore, which meant the admin's direct loan-creation
      // route (POST /api/admin/loans, which calls this method directly
      // and never goes through createOrderCore) could still open a
      // PayGo plan for a customer with no ID on file at all.
      const [customerRow] = await tx.select({ nationalId: customers.nationalId }).from(customers).where(eq(customers.id, input.customerId));
      if (!customerRow?.nationalId) {
        throw new Error('A national ID (16 digits) is required to open a PayGo installment plan. Please add one to this customer\'s profile first.');
      }

      // ---- Installment sequencing rule (row-locked) ----
      const openLoans = await tx
        .select({ id: loans.id, loanNumber: loans.loanNumber, status: loans.status })
        .from(loans)
        .where(eq(loans.customerId, input.customerId))
        .for('update');
      const blockingLoan = openLoans.find((l) => l.status === 'active' || l.status === 'defaulted');
      if (blockingLoan) {
        throw new PayGoSequencingBlockError(
          `This customer already has an installment plan (${blockingLoan.loanNumber}) that hasn't been fully paid off yet. They need to finish paying it before starting a new one.`
        );
      }

      // ---- Same check, but by REAL IDENTITY, not just customer record ----
      // The check above only looks at loans tied to THIS customerId. But
      // nothing stops the same real person from ending up with two
      // separate customer records (e.g. registered twice with different
      // phone numbers, by mistake or deliberately, to get around the
      // one-loan-at-a-time rule) — the customerId would legitimately be
      // different, so the check above alone would miss it. National ID is
      // the one identity marker that's actually the same person, so we
      // also check for a blocking loan under ANY OTHER customer record
      // that shares this person's national ID hash. Skipped entirely if
      // this customer doesn't have a national ID on file (nothing to
      // cross-check against).
      const [thisCustomer] = await tx.select({ nationalIdHash: customers.nationalIdHash }).from(customers).where(eq(customers.id, input.customerId));
      if (thisCustomer?.nationalIdHash) {
        const sameIdentityCustomers = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.nationalIdHash, thisCustomer.nationalIdHash));
        const otherCustomerIds = sameIdentityCustomers.map((c) => c.id).filter((id) => id !== input.customerId);

        if (otherCustomerIds.length > 0) {
          const loansUnderSameIdentity = await tx
            .select({ id: loans.id, loanNumber: loans.loanNumber, status: loans.status, customerId: loans.customerId })
            .from(loans)
            .where(inArray(loans.customerId, otherCustomerIds))
            .for('update');
          const identityBlockingLoan = loansUnderSameIdentity.find((l) => l.status === 'active' || l.status === 'defaulted');
          if (identityBlockingLoan) {
            // Deliberately vague to whoever triggered this (an agent, via
            // the order/checkout flow) — the full detail (which loan,
            // which other customer record) is logged server-side for an
            // admin to review instead of being returned in the error.
            // Revealing "this exact national ID already exists in our
            // system under record #X" to whoever submitted it is an
            // information leak: a bad actor probing the system with
            // National ID numbers could use a specific, confirming error
            // message to figure out which real people are already
            // Kosmotive customers, even without ever being able to log
            // in as them. A generic block message gives a legitimate
            // agent enough to know something needs admin attention,
            // without confirming anything about a stranger's identity to
            // anyone testing the system.
            console.warn(
              `[loan-block] Identity-based PayGo block: national ID hash ${thisCustomer.nationalIdHash} — new attempt for customer #${input.customerId}, blocked by existing ${identityBlockingLoan.status} loan ${identityBlockingLoan.loanNumber} under customer #${identityBlockingLoan.customerId}. Review in the admin Customers tab.`
            );
            throw new PayGoSequencingBlockError(
              'This customer cannot open a new PayGo loan right now. Please contact KosmoPads admin support for assistance.'
            );
          }
        }
      }

      const [loan] = await tx
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
      await tx.insert(installments).values(schedule);

      // ---- Record disbursement in the audit trail ----
      await tx.insert(loanTransactions).values({
        loanId: loan.id,
        type: 'disbursement',
        amountRwf: financedRwf,
        method: null,
        adminId: input.adminId ?? null,
        note: `Loan disbursed. Down payment: ${input.downPaymentRwf} RWF. Term: ${input.termMonths} months.`,
      });

      // ---- Record the customer's agreement acceptance, if provided ----
      if (input.agreement) {
        await tx.insert(loanAgreements).values({
          loanId: loan.id,
          orderId: input.orderId ?? null,
          customerId: input.customerId,
          agentId: input.agreement.agentId ?? null,
          termsVersion: input.agreement.termsVersion || 'v1',
          ipAddress: input.agreement.ipAddress || null,
          userAgent: input.agreement.userAgent || null,
        });
      }

      return loan;
    };

    // If the caller already has an open transaction (e.g. createOrderCore
    // creating the order and the loan together), run inside it — that's
    // what makes the order and the loan commit or roll back as one unit.
    // Otherwise (admin manually creating a loan, the seed script), open a
    // fresh transaction exactly as before.
    return input.client ? runInTransaction(input.client) : db.transaction(runInTransaction);
  }

  // ============================================
  // Record a payment against a specific installment. Handles partial
  // payments, overpayment spillover into the next unpaid installment,
  // and marks the loan completed once every installment is fully paid.
  // ============================================
  // Wrapped in one transaction: the installment update, the loan_transactions
  // audit row, the ledger entry, and (if this payment completes the loan)
  // the loan's status flip to 'completed' all land together or not at all.
  // The completion email is sent AFTER commit — best-effort notification,
  // not something that should roll back a real payment if it fails to send.
  static async recordPayment(
    installmentId: number,
    input: { amountRwf: number; method: string; phone?: string; note?: string; adminId?: number | null }
  ) {
    const { loanId, allPaid, loanNumber, customerId, totalAppliedThisCall } = await db.transaction(async (tx) => {
      const [installment] = await tx.select().from(installments).where(eq(installments.id, installmentId));
      if (!installment) throw new Error('Installment not found');

      const [loan] = await tx.select().from(loans).where(eq(loans.id, installment.loanId));
      if (!loan) throw new Error('Loan not found');

      // ---- Resolve the agent who sold this, once, before the loop ----
      // PayGo commission accrues PER INSTALLMENT PAYMENT, proportional to
      // what's actually collected right now — not as one lump sum when
      // the order is created, and not held back until the whole loan is
      // paid off. Waiting for full payoff could mean an agent waits many
      // months for any commission on a sale they already made; paying it
      // all upfront would mean Kosmotive pays commission on money it
      // hasn't collected yet. Accruing per payment keeps the agent's
      // incentive aligned with the customer's ENTIRE repayment journey —
      // they have a reason to check in on their customer at any point in
      // the loan term, not just once at the start.
      let commissionAgent: { id: number; commissionRateBps: number } | null = null;
      if (loan.orderId) {
        const [order] = await tx.select({ agentId: orders.agentId }).from(orders).where(eq(orders.id, loan.orderId));
        if (order?.agentId) {
          const [agent] = await tx.select({ id: agents.id, commissionRateBps: agents.commissionRateBps }).from(agents).where(eq(agents.id, order.agentId));
          if (agent) commissionAgent = agent;
        }
      }

      let remaining = input.amountRwf;
      let totalAppliedThisCall = 0;
      let cursor = installment;

      while (remaining > 0 && cursor) {
        const owed = cursor.amountDueRwf + (cursor.penaltyRwf || 0) - (cursor.amountPaidRwf || 0);
        const applied = Math.min(remaining, Math.max(owed, 0));

        if (applied > 0) {
          totalAppliedThisCall += applied;
          const newPaid = (cursor.amountPaidRwf || 0) + applied;
          const fullyPaid = newPaid >= cursor.amountDueRwf + (cursor.penaltyRwf || 0);

          await tx
            .update(installments)
            .set({
              amountPaidRwf: newPaid,
              status: fullyPaid ? 'paid' : 'partial',
              paidAt: fullyPaid ? new Date() : cursor.paidAt,
              updatedAt: new Date(),
            })
            .where(eq(installments.id, cursor.id));

          await tx.insert(loanTransactions).values({
            loanId: loan.id,
            installmentId: cursor.id,
            type: 'payment',
            amountRwf: applied,
            method: input.method,
            phone: input.phone || null,
            adminId: input.adminId ?? null,
            note: input.note || null,
          });

          // Ledger entry: cash actually received by Kosmotive for this
          // installment payment — part of the same unified financial
          // history as order payments and commission accruals/payouts.
          await LedgerService.record(
            {
              accountType: 'business',
              amountRwf: applied,
              category: 'loan_repayment',
              referenceType: 'installment',
              referenceId: cursor.id,
              description: `PayGo installment #${cursor.installmentNumber} payment on loan ${loan.loanNumber}`,
              createdByAdminId: input.adminId ?? null,
            },
            tx
          );

          // ---- Agent commission accrual for THIS payment ----
          if (commissionAgent) {
            const commissionRwf = Math.round((applied * commissionAgent.commissionRateBps) / 10000);
            if (commissionRwf > 0) {
              const [commissionRow] = await tx
                .insert(agentCommissions)
                .values({
                  agentId: commissionAgent.id,
                  orderId: loan.orderId!,
                  loanId: loan.id,
                  installmentId: cursor.id,
                  saleAmountRwf: applied,
                  commissionRateBps: commissionAgent.commissionRateBps,
                  commissionRwf,
                  status: 'pending',
                  note: `Accrued from installment #${cursor.installmentNumber} payment on loan ${loan.loanNumber}`,
                })
                .returning();

              await LedgerService.record(
                {
                  accountType: 'agent',
                  accountId: commissionAgent.id,
                  amountRwf: commissionRwf,
                  category: 'commission_accrued',
                  referenceType: 'agent_commission',
                  referenceId: commissionRow.id,
                  description: `Commission accrued from PayGo installment #${cursor.installmentNumber} payment on loan ${loan.loanNumber}`,
                },
                tx
              );
            }
          }
        }

        remaining -= applied;

        if (remaining <= 0) break;

        // Overpayment spills into the next unpaid installment on the same loan
        const siblings = await tx.select().from(installments).where(eq(installments.loanId, loan.id));
        const nextUnpaid = siblings
          .filter((i) => i.status !== 'paid' && i.id !== cursor.id)
          .sort((a, b) => a.installmentNumber - b.installmentNumber)[0];

        if (!nextUnpaid) break; // nothing left to apply the overpayment to
        cursor = nextUnpaid;
      }

      // ---- Check if loan is fully paid off ----
      const allInstallments = await tx.select().from(installments).where(eq(installments.loanId, loan.id));
      const allPaid = allInstallments.every((i) => i.status === 'paid');
      if (allPaid) {
        await tx
          .update(loans)
          .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
          .where(eq(loans.id, loan.id));
      }

      return { loanId: loan.id, allPaid, loanNumber: loan.loanNumber, customerId: loan.customerId, totalAppliedThisCall };
    });

    // ---- Confirmation sent after EVERY installment payment ----
    // Not just when the loan finishes — a customer paying over many
    // months deserves to see, each time, exactly what they just paid and
    // what's still left. Reaches the customer by SMS (every customer has
    // a phone) and by email too when they have one on file.
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    if (customer) {
      const allInstallments = await db.select().from(installments).where(eq(installments.loanId, loanId));
      const totalPaidRwf = allInstallments.reduce((s, i) => s + (i.amountPaidRwf || 0), 0);
      const [loanRow] = await db.select({ totalPayableRwf: loans.totalPayableRwf }).from(loans).where(eq(loans.id, loanId));
      const remainingBalanceRwf = Math.max(0, (loanRow?.totalPayableRwf ?? 0) - totalPaidRwf);
      const customerName = `${customer.firstName} ${customer.lastName}`;

      await SmsService.sendInstallmentPaymentConfirmation(customer.phone, {
        customerName,
        loanNumber,
        amountPaidRwf: totalAppliedThisCall,
        remainingBalanceRwf,
        isFullyPaid: allPaid,
      }).catch((err) => console.error('Installment payment SMS error (non-fatal):', err));

      if (customer.email) {
        const lastPaidInstallment = allInstallments.filter((i) => i.status === 'paid').sort((a, b) => b.installmentNumber - a.installmentNumber)[0];
        EmailService.sendInstallmentPaymentReceipt({
          customerName,
          customerEmail: customer.email,
          loanNumber,
          installmentNumber: lastPaidInstallment?.installmentNumber ?? 1,
          amountPaidRwf: totalAppliedThisCall,
          remainingBalanceRwf,
          isFullyPaid: allPaid,
        }).catch((err) => console.error('Installment payment email error (non-fatal):', err));
      }
    }

    return { loanId, allPaid };
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
  // CUSTOMER SELF-SERVICE — initiate a MoMo Request-to-Pay against a
  // specific installment. The customer's phone gets an approval prompt;
  // resolution happens later via webhook (fast) or the reconciliation
  // poll (safety net) — see resolveMomoReference / reconcilePendingMomoTransactions.
  //
  // Guards:
  //  - blocks a second concurrent request on the same installment unless
  //    the prior one has expired (prevents duplicate MTN prompts)
  //  - caps the amount at what's actually outstanding on the loan, so a
  //    typo or a malicious client can't request more than is owed
  //  - rejects on a non-active loan or an already-paid installment
  // ============================================
  static async initiateMomoPayment(installmentId: number, amountRwf: number, phone: string) {
    if (amountRwf < 100) throw new Error('Minimum payment amount is 100 RWF');

    const [installment] = await db.select().from(installments).where(eq(installments.id, installmentId));
    if (!installment) throw new Error('Installment not found');
    if (installment.status === 'paid') throw new Error('This installment is already fully paid');

    const [loan] = await db.select().from(loans).where(eq(loans.id, installment.loanId));
    if (!loan) throw new Error('Loan not found');
    if (loan.status !== 'active') throw new Error(`This loan is ${loan.status} — no payment is needed`);

    // Block a duplicate concurrent request unless the existing one is stale
    if (installment.pendingMomoReferenceId) {
      const ageMinutes = installment.pendingMomoInitiatedAt
        ? (Date.now() - installment.pendingMomoInitiatedAt.getTime()) / 60000
        : Infinity;
      if (ageMinutes < MOMO_PENDING_TIMEOUT_MINUTES) {
        throw new Error(
          'A payment request is already pending on this installment — approve it on your phone, or wait a few minutes and try again.'
        );
      }
      // stale (customer likely ignored/missed the earlier prompt) — fall through and overwrite it
    }

    // Cap at total outstanding across the whole loan (covers deliberate
    // early-payoff amounts that exceed a single installment) so a bad
    // amount can never overcharge past what's actually owed.
    const allInstallments = await db.select().from(installments).where(eq(installments.loanId, loan.id));
    const totalOutstandingRwf = allInstallments.reduce(
      (s, i) => s + Math.max(0, i.amountDueRwf + (i.penaltyRwf || 0) - (i.amountPaidRwf || 0)),
      0
    );
    if (amountRwf > totalOutstandingRwf) {
      throw new Error(`Amount exceeds what's owed on this loan (${totalOutstandingRwf.toLocaleString()} RWF outstanding)`);
    }

    const reference = `${loan.loanNumber}-INST${installment.installmentNumber}-${Date.now()}`;
    const result = await MomoService.initiatePayment({
      phone,
      amount: amountRwf,
      reference,
      description: `PayGo installment #${installment.installmentNumber} - ${loan.loanNumber}`,
    });

    if (!result.transactionId) {
      throw new Error(result.message || 'Failed to initiate MoMo payment');
    }

    await db
      .update(installments)
      .set({
        pendingMomoReferenceId: result.transactionId,
        pendingMomoAmountRwf: amountRwf,
        pendingMomoPhone: phone,
        pendingMomoInitiatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(installments.id, installmentId));

    return {
      referenceId: result.transactionId,
      status: result.status, // 'pending' (real MTN request) or 'pending_manual' (USSD fallback)
      message: result.message,
    };
  }

  // ============================================
  // Resolve one pending MoMo reference — called by both the webhook (fast
  // path, app.ts) and the polling reconciler (safety net below). Race-safe:
  // the conditional UPDATE only succeeds for whichever caller gets there
  // first, so a webhook and a poll landing at the same moment can never
  // both apply the same payment.
  // ============================================
  static async resolveMomoReference(
    referenceId: string,
    mtnStatus: 'SUCCESSFUL' | 'FAILED'
  ): Promise<{ resolved: boolean; installmentId?: number; allPaid?: boolean }> {
    const [installment] = await db
      .select()
      .from(installments)
      .where(eq(installments.pendingMomoReferenceId, referenceId));
    if (!installment) return { resolved: false }; // not one of ours, or already claimed by a concurrent caller

    // Atomic claim — only proceeds if this row still has this exact
    // referenceId pending (i.e. nobody else has processed it yet).
    const claimed = await db
      .update(installments)
      .set({
        pendingMomoReferenceId: null,
        pendingMomoAmountRwf: null,
        pendingMomoPhone: null,
        pendingMomoInitiatedAt: null,
        updatedAt: new Date(),
      })
      .where(
        sql`${installments.id} = ${installment.id} AND ${installments.pendingMomoReferenceId} = ${referenceId}`
      )
      .returning();

    if (claimed.length === 0) return { resolved: false }; // lost the race — another caller already handled this

    if (mtnStatus === 'SUCCESSFUL' && installment.pendingMomoAmountRwf) {
      const result = await this.recordPayment(installment.id, {
        amountRwf: installment.pendingMomoAmountRwf,
        method: 'momo',
        phone: installment.pendingMomoPhone || undefined,
        note: `MoMo payment confirmed (ref ${referenceId})`,
      });
      return { resolved: true, installmentId: installment.id, allPaid: result.allPaid };
    }

    // FAILED — nothing charged; pending state is already cleared above so the customer can retry immediately
    return { resolved: true, installmentId: installment.id };
  }

  // ============================================
  // AUTOMATION 5/5 — poll MTN for any installment with a still-pending
  // MoMo request. Runs on a short interval (minutes, wired in app.ts)
  // rather than the daily sweep, since this is what makes "customer taps
  // approve on their phone" actually mark the installment paid without
  // depending on the webhook arriving.
  // ============================================
  static async reconcilePendingMomoTransactions(): Promise<{
    checked: number;
    completed: number;
    failed: number;
    stillPending: number;
  }> {
    const pending = await db
      .select()
      .from(installments)
      .where(sql`${installments.pendingMomoReferenceId} IS NOT NULL`);

    let completed = 0;
    let failedCount = 0;
    let stillPending = 0;

    for (const inst of pending) {
      if (!inst.pendingMomoReferenceId) continue;

      const ageMinutes = inst.pendingMomoInitiatedAt
        ? (Date.now() - inst.pendingMomoInitiatedAt.getTime()) / 60000
        : Infinity;

      const status = await MomoService.checkPaymentStatus(inst.pendingMomoReferenceId);

      if (status.status === 'SUCCESSFUL') {
        const result = await this.resolveMomoReference(inst.pendingMomoReferenceId, 'SUCCESSFUL');
        if (result.resolved) completed++;
      } else if (status.status === 'FAILED') {
        console.log(
          `[loan] MoMo request ${inst.pendingMomoReferenceId} (installment ${inst.id}) FAILED — MTN reason: ${status.reason || 'not provided'}`
        );
        await this.resolveMomoReference(inst.pendingMomoReferenceId, 'FAILED');
        failedCount++;
      } else if (ageMinutes > MOMO_PENDING_TIMEOUT_MINUTES) {
        // Timed out without ever resolving — clear it so the customer can
        // retry. Race-safe conditional clear, same pattern as resolveMomoReference.
        await db
          .update(installments)
          .set({
            pendingMomoReferenceId: null,
            pendingMomoAmountRwf: null,
            pendingMomoPhone: null,
            pendingMomoInitiatedAt: null,
            updatedAt: new Date(),
          })
          .where(
            sql`${installments.id} = ${inst.id} AND ${installments.pendingMomoReferenceId} = ${inst.pendingMomoReferenceId}`
          );
        failedCount++;
      } else {
        stillPending++;
      }
    }

    return { checked: pending.length, completed, failed: failedCount, stillPending };
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
      const customerName = `${customer.firstName} ${customer.lastName}`;

      if (customer.email) {
        await EmailService.sendInstallmentReminder({
          customerName,
          customerEmail: customer.email,
          loanNumber: loan.loanNumber,
          installmentNumber: inst.installmentNumber,
          amountDueRwf: inst.amountDueRwf,
          dueDate: inst.dueDate,
          daysUntilDue,
        }).catch((err) => console.error('Installment reminder email error (non-fatal):', err));
      }

      // SMS is sent unconditionally (every customer has a phone; email is
      // optional) — this is the channel that actually reaches most
      // customers, not a backup for when email is unavailable.
      await SmsService.sendInstallmentReminder(customer.phone, {
        customerName,
        loanNumber: loan.loanNumber,
        amountDueRwf: inst.amountDueRwf,
        daysUntilDue,
      }).catch((err) => console.error('Installment reminder SMS error (non-fatal):', err));

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

      // ---- One-time overdue alert: email + SMS ----
      if (!inst.overdueAlertSentAt) {
        const [loan] = await db.select().from(loans).where(eq(loans.id, inst.loanId));
        const [customer] = loan ? await db.select().from(customers).where(eq(customers.id, loan.customerId)) : [];
        if (loan && customer) {
          const amountOwedRwf = outstanding + (inst.penaltyRwf || 0);
          const customerName = `${customer.firstName} ${customer.lastName}`;

          if (customer.email) {
            await EmailService.sendInstallmentOverdueAlert({
              customerName,
              customerEmail: customer.email,
              loanNumber: loan.loanNumber,
              installmentNumber: inst.installmentNumber,
              amountOwedRwf,
              daysOverdue,
            }).catch((err) => console.error('Overdue alert email error (non-fatal):', err));
          }

          // Same reasoning as the reminder above — SMS reaches every
          // customer, not just the ones who provided an email.
          await SmsService.sendOverdueAlert(customer.phone, {
            customerName,
            loanNumber: loan.loanNumber,
            amountOwedRwf,
            daysOverdue,
          }).catch((err) => console.error('Overdue alert SMS error (non-fatal):', err));
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
