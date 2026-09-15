// ============================================
// Pure PayGo loan-math functions.
//
// Extracted out of LoanService.createLoan so the actual arithmetic can be
// unit-tested without a database connection. LoanService still owns
// everything transactional (row locks, inserts, audit trail) — this file
// owns only "given these numbers, what should the schedule look like."
// ============================================

export interface LoanTerms {
  financedRwf: number;
  interestRwf: number;
  totalPayableRwf: number;
}

export interface ScheduledInstallment {
  installmentNumber: number;
  dueDate: Date;
  amountDueRwf: number;
}

/**
 * Computes the financed amount, flat interest, and total payable for a
 * PayGo loan.
 *
 * interest = financedRwf * interestRateBps / 10,000 (flat rate over the
 * whole term, not compounding per month).
 *
 * Throws if the down payment leaves nothing left to finance — mirrors the
 * guard that previously lived inline in LoanService.createLoan.
 */
export function calculateLoanTerms(input: {
  principalRwf: number;
  downPaymentRwf: number;
  interestRateBps: number;
}): LoanTerms {
  const financedRwf = input.principalRwf - input.downPaymentRwf;
  if (financedRwf <= 0) {
    throw new Error('Down payment must be less than the principal — nothing left to finance.');
  }
  const interestRwf = Math.round((financedRwf * input.interestRateBps) / 10000);
  const totalPayableRwf = financedRwf + interestRwf;
  return { financedRwf, interestRwf, totalPayableRwf };
}

/**
 * Splits totalPayableRwf into termMonths equal installments, one per
 * month starting one month after disbursedAt. The LAST installment
 * absorbs whatever remainder integer division leaves behind, so
 * SUM(amountDueRwf) === totalPayableRwf always holds exactly — no matter
 * how badly totalPayableRwf and termMonths divide.
 */
export function generateInstallmentSchedule(input: {
  totalPayableRwf: number;
  termMonths: number;
  disbursedAt: Date;
}): ScheduledInstallment[] {
  if (input.termMonths <= 0) {
    throw new Error('termMonths must be at least 1.');
  }
  const baseAmount = Math.floor(input.totalPayableRwf / input.termMonths);
  const remainder = input.totalPayableRwf - baseAmount * input.termMonths;

  const schedule: ScheduledInstallment[] = [];
  for (let i = 1; i <= input.termMonths; i++) {
    const amountDueRwf = i === input.termMonths ? baseAmount + remainder : baseAmount;
    schedule.push({
      installmentNumber: i,
      dueDate: addMonths(input.disbursedAt, i),
      amountDueRwf,
    });
  }
  return schedule;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * One-time late-payment penalty applied when an installment first crosses
 * the grace period: penaltyRateBps of the installment's ORIGINAL
 * amountDueRwf (not the remaining balance) — matches
 * LoanService.sweepOverdueAndPenalize, which only ever applies this once
 * per installment (gated on penaltyRwf still being 0).
 */
export function calculatePenalty(input: {
  amountDueRwf: number;
  penaltyRateBps: number;
}): number {
  return Math.round((input.amountDueRwf * input.penaltyRateBps) / 10000);
}
