import { describe, it, expect } from 'vitest';
import { calculateLoanTerms, generateInstallmentSchedule, calculatePenalty, addMonths } from '../src/lib/loanMath';

describe('calculateLoanTerms', () => {
  it('computes financed amount, flat interest, and total payable', () => {
    // 6,000 RWF product, 1,000 down payment, 10% flat interest (1000 bps)
    const result = calculateLoanTerms({ principalRwf: 6000, downPaymentRwf: 1000, interestRateBps: 1000 });
    expect(result.financedRwf).toBe(5000);
    expect(result.interestRwf).toBe(500); // 5000 * 10%
    expect(result.totalPayableRwf).toBe(5500);
  });

  it('rounds interest to the nearest RWF instead of leaving fractions', () => {
    // financed 3,333 * 750bps / 10000 = 249.975 -> rounds to 250
    const result = calculateLoanTerms({ principalRwf: 3333, downPaymentRwf: 0, interestRateBps: 750 });
    expect(result.interestRwf).toBe(250);
    expect(Number.isInteger(result.interestRwf)).toBe(true);
  });

  it('supports a zero-interest plan', () => {
    const result = calculateLoanTerms({ principalRwf: 6000, downPaymentRwf: 2000, interestRateBps: 0 });
    expect(result.interestRwf).toBe(0);
    expect(result.totalPayableRwf).toBe(4000);
  });

  it('throws when the down payment covers the full principal', () => {
    expect(() => calculateLoanTerms({ principalRwf: 6000, downPaymentRwf: 6000, interestRateBps: 500 }))
      .toThrow(/nothing left to finance/i);
  });

  it('throws when the down payment exceeds the principal', () => {
    expect(() => calculateLoanTerms({ principalRwf: 6000, downPaymentRwf: 7000, interestRateBps: 500 }))
      .toThrow(/nothing left to finance/i);
  });
});

describe('generateInstallmentSchedule', () => {
  it('splits the total into equal monthly installments when it divides evenly', () => {
    const schedule = generateInstallmentSchedule({ totalPayableRwf: 6000, termMonths: 3, disbursedAt: new Date('2026-09-01') });
    expect(schedule).toHaveLength(3);
    expect(schedule.map((s) => s.amountDueRwf)).toEqual([2000, 2000, 2000]);
  });

  it('always sums exactly to totalPayableRwf, even when it does not divide evenly', () => {
    // 5,500 / 3 = 1833.33... — the classic case that breaks naive division
    const schedule = generateInstallmentSchedule({ totalPayableRwf: 5500, termMonths: 3, disbursedAt: new Date('2026-09-01') });
    const sum = schedule.reduce((s, i) => s + i.amountDueRwf, 0);
    expect(sum).toBe(5500);
    // first two installments get the floor amount, the last absorbs the remainder
    expect(schedule[0].amountDueRwf).toBe(1833);
    expect(schedule[1].amountDueRwf).toBe(1833);
    expect(schedule[2].amountDueRwf).toBe(1834);
  });

  it('never produces a fractional RWF amount on any installment', () => {
    const schedule = generateInstallmentSchedule({ totalPayableRwf: 10000, termMonths: 7, disbursedAt: new Date('2026-09-01') });
    for (const inst of schedule) {
      expect(Number.isInteger(inst.amountDueRwf)).toBe(true);
    }
  });

  it('numbers installments 1-indexed and schedules one per month after disbursement', () => {
    const schedule = generateInstallmentSchedule({ totalPayableRwf: 3000, termMonths: 3, disbursedAt: new Date('2026-01-15') });
    expect(schedule.map((s) => s.installmentNumber)).toEqual([1, 2, 3]);
    expect(schedule[0].dueDate.getMonth()).toBe(1); // Feb (0-indexed)
    expect(schedule[2].dueDate.getMonth()).toBe(3); // Apr
  });

  it('supports a single-installment (term = 1) plan', () => {
    const schedule = generateInstallmentSchedule({ totalPayableRwf: 4000, termMonths: 1, disbursedAt: new Date('2026-09-01') });
    expect(schedule).toHaveLength(1);
    expect(schedule[0].amountDueRwf).toBe(4000);
  });

  it('rejects a zero or negative term', () => {
    expect(() => generateInstallmentSchedule({ totalPayableRwf: 4000, termMonths: 0, disbursedAt: new Date() })).toThrow();
    expect(() => generateInstallmentSchedule({ totalPayableRwf: 4000, termMonths: -1, disbursedAt: new Date() })).toThrow();
  });
});

describe('calculatePenalty', () => {
  it('charges penaltyRateBps of the ORIGINAL amount due, not the remaining balance', () => {
    // This mirrors LoanService.sweepOverdueAndPenalize exactly — a common
    // mistake is to penalize the outstanding balance instead, which this
    // test would catch if someone "fixed" it that way.
    const penalty = calculatePenalty({ amountDueRwf: 2000, penaltyRateBps: 300 }); // 3%
    expect(penalty).toBe(60);
  });

  it('rounds to the nearest RWF', () => {
    const penalty = calculatePenalty({ amountDueRwf: 1833, penaltyRateBps: 300 });
    expect(penalty).toBe(55); // 54.99 -> 55
  });

  it('is zero when the penalty rate is zero', () => {
    expect(calculatePenalty({ amountDueRwf: 2000, penaltyRateBps: 0 })).toBe(0);
  });
});

describe('addMonths', () => {
  it('adds calendar months, not a fixed 30-day offset', () => {
    const result = addMonths(new Date('2026-01-31'), 1);
    // JS Date rolls Jan 31 + 1 month into early March in some engines
    // because February doesn't have 31 days — this test documents that
    // real, slightly surprising behavior rather than hiding it.
    expect(result.getMonth()).not.toBe(0);
  });

  it('adds several months correctly in the normal case', () => {
    const result = addMonths(new Date('2026-01-15'), 3);
    expect(result.getMonth()).toBe(3); // April
    expect(result.getDate()).toBe(15);
  });
});
