import { eq, inArray } from 'drizzle-orm';
import { db } from '../config/database';
import { loans, installments } from '../db/schema';

// ============================================
// CreditScoreService
//
// WHY THIS EXISTS: your one-active-loan-at-a-time rule (and the identity
// check on top of it) protects Kosmotive from a customer overextending —
// but it treats every customer identically regardless of track record.
// A customer who's completed three loans and paid every installment on
// time is a fundamentally lower risk than someone on their first loan,
// yet both currently get the same interest rate and term limits. This is
// the core insight behind most successful PayGo/microfinance products
// (M-Kopa, Tala, Branch, etc.) — turn repayment behavior into better
// terms for good payers, which both rewards reliable customers and gives
// Kosmotive a real incentive-aligned tool for reducing default risk over
// time (good customers self-select into wanting to stay "good").
//
// THIS IS A SUGGESTION ENGINE, NOT AN AUTO-APPROVAL SYSTEM. It computes a
// tier and a suggested interest-rate adjustment; an admin still manually
// creates the loan and decides whether to apply the suggestion. Lending
// decisions stay human — this just gives the human better information,
// consistent with keeping a person in the loop for anything that isn't
// routine (see the earlier platform-automation discussion).
//
// TUNABLE via env vars, same pattern as LoanService's other business
// rules, so ops can adjust thresholds without a code deploy.
// ============================================

const SILVER_MIN_COMPLETED_LOANS = Number(process.env.CREDIT_SILVER_MIN_LOANS || 1);
const SILVER_MIN_ON_TIME_RATE = Number(process.env.CREDIT_SILVER_MIN_ON_TIME_RATE || 0.8); // 80%
const GOLD_MIN_COMPLETED_LOANS = Number(process.env.CREDIT_GOLD_MIN_LOANS || 3);
const GOLD_MIN_ON_TIME_RATE = Number(process.env.CREDIT_GOLD_MIN_ON_TIME_RATE || 0.95); // 95%

const SILVER_RATE_DISCOUNT_BPS = Number(process.env.CREDIT_SILVER_RATE_DISCOUNT_BPS || 50); // 0.5% off
const GOLD_RATE_DISCOUNT_BPS = Number(process.env.CREDIT_GOLD_RATE_DISCOUNT_BPS || 100); // 1% off
const SILVER_EXTRA_TERM_MONTHS = Number(process.env.CREDIT_SILVER_EXTRA_TERM_MONTHS || 1);
const GOLD_EXTRA_TERM_MONTHS = Number(process.env.CREDIT_GOLD_EXTRA_TERM_MONTHS || 2);

export type CreditTier = 'new' | 'needs_review' | 'bronze' | 'silver' | 'gold';

export interface CreditProfile {
  tier: CreditTier;
  tierLabel: string;
  completedLoans: number;
  defaultedLoans: number;
  totalInstallmentsDue: number;
  onTimeInstallments: number;
  onTimePaymentRate: number | null; // null = no history yet to judge
  hasActiveLoan: boolean;
  suggestion: {
    interestRateDiscountBps: number;
    extraTermMonths: number;
    note: string;
  };
}

const TIER_LABELS: Record<CreditTier, string> = {
  new: 'New customer — no PayGo history yet',
  needs_review: 'Needs review — has a defaulted loan on record',
  bronze: 'Bronze — building a track record',
  silver: 'Silver — reliable repayment history',
  gold: 'Gold — excellent repayment history',
};

export class CreditScoreService {
  static async getProfile(customerId: number): Promise<CreditProfile> {
    const customerLoans = await db.select().from(loans).where(eq(loans.customerId, customerId));

    const completedLoans = customerLoans.filter((l) => l.status === 'completed').length;
    const defaultedLoans = customerLoans.filter((l) => l.status === 'defaulted').length;
    const hasActiveLoan = customerLoans.some((l) => l.status === 'active');

    // On-time rate is computed across every PAST-DUE installment on every
    // loan this customer has ever had (not just completed loans) — this
    // catches someone who's currently mid-loan but has a pattern of late
    // payments, not just their final completed/defaulted outcome.
    const loanIds = customerLoans.map((l) => l.id);
    let totalInstallmentsDue = 0;
    let onTimeInstallments = 0;

    if (loanIds.length > 0) {
      const allInstallments = await db.select().from(installments).where(inArray(installments.loanId, loanIds));
      const now = new Date();
      const pastDue = allInstallments.filter((i) => i.dueDate <= now);
      totalInstallmentsDue = pastDue.length;
      onTimeInstallments = pastDue.filter((i) => {
        if (i.status !== 'paid' || !i.paidAt) return false;
        return i.paidAt <= i.dueDate;
      }).length;
    }

    const onTimePaymentRate = totalInstallmentsDue > 0 ? onTimeInstallments / totalInstallmentsDue : null;

    // ---- Determine tier ----
    let tier: CreditTier;
    if (defaultedLoans > 0) {
      // A default anywhere in the history means "needs a human to look at
      // this," regardless of how good other numbers look — this is a
      // deliberate conservative choice, not an oversight.
      tier = 'needs_review';
    } else if (completedLoans === 0) {
      tier = 'new';
    } else if (completedLoans >= GOLD_MIN_COMPLETED_LOANS && (onTimePaymentRate ?? 0) >= GOLD_MIN_ON_TIME_RATE) {
      tier = 'gold';
    } else if (completedLoans >= SILVER_MIN_COMPLETED_LOANS && (onTimePaymentRate ?? 0) >= SILVER_MIN_ON_TIME_RATE) {
      tier = 'silver';
    } else {
      tier = 'bronze';
    }

    const suggestion =
      tier === 'gold'
        ? { interestRateDiscountBps: GOLD_RATE_DISCOUNT_BPS, extraTermMonths: GOLD_EXTRA_TERM_MONTHS, note: `Suggest ${(GOLD_RATE_DISCOUNT_BPS / 100).toFixed(1)}% lower interest and up to ${GOLD_EXTRA_TERM_MONTHS} extra month(s) term — ${completedLoans} completed loan(s), ${Math.round((onTimePaymentRate ?? 0) * 100)}% on-time.` }
        : tier === 'silver'
        ? { interestRateDiscountBps: SILVER_RATE_DISCOUNT_BPS, extraTermMonths: SILVER_EXTRA_TERM_MONTHS, note: `Suggest ${(SILVER_RATE_DISCOUNT_BPS / 100).toFixed(1)}% lower interest — ${completedLoans} completed loan(s), ${Math.round((onTimePaymentRate ?? 0) * 100)}% on-time.` }
        : tier === 'needs_review'
        ? { interestRateDiscountBps: 0, extraTermMonths: 0, note: `Has ${defaultedLoans} defaulted loan(s) on record — review manually before extending new credit.` }
        : { interestRateDiscountBps: 0, extraTermMonths: 0, note: tier === 'new' ? 'No completed PayGo loans yet — standard terms apply.' : 'Standard terms — not yet enough on-time history for a discount.' };

    return {
      tier,
      tierLabel: TIER_LABELS[tier],
      completedLoans,
      defaultedLoans,
      totalInstallmentsDue,
      onTimeInstallments,
      onTimePaymentRate,
      hasActiveLoan,
      suggestion,
    };
  }
}
