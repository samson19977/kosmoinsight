import { LoanService } from '../services/loan.service';

// ==========================================================
// Lightweight in-process scheduler for PayGo automation. No extra
// dependency (plain setInterval) so it runs anywhere Node runs —
// swap for a real cron/queue (e.g. a scheduled Render job hitting
// these same service functions, or BullMQ) if this ever needs to
// survive across multiple server instances/dynos.
//
// Two jobs:
//  1. Overdue sweep (daily-ish): activates upcoming installments near
//     their due date, flags overdue ones + applies penalties, and
//     auto-defaults loans with too many overdue installments.
//  2. MoMo reconciliation (every few minutes): checks any pending
//     collection request against MTN and auto-allocates the payment
//     the moment the customer approves it on their phone — this is
//     what makes "pay all / pay partially" happen without an admin
//     having to manually mark anything paid.
// ==========================================================

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day
const RECONCILE_INTERVAL_MS = 3 * 60 * 1000; // every 3 minutes

let sweepTimer: NodeJS.Timeout | null = null;
let reconcileTimer: NodeJS.Timeout | null = null;

async function runSweep() {
  try {
    const result = await LoanService.applyOverduePenalties();
    if (result.flagged > 0 || result.defaulted > 0 || result.activated > 0) {
      console.log(
        `[scheduler] overdue sweep: ${result.activated} activated, ${result.flagged} flagged overdue, ${result.defaulted} auto-defaulted`
      );
    }
  } catch (error) {
    console.error('[scheduler] overdue sweep failed:', error);
  }
}

async function runReconcile() {
  try {
    const result = await LoanService.reconcilePendingMomoTransactions();
    if (result.checked > 0) {
      console.log(
        `[scheduler] MoMo reconcile: ${result.completed} completed, ${result.failed} failed, ${result.stillPending} still pending`
      );
    }
  } catch (error) {
    console.error('[scheduler] MoMo reconcile failed:', error);
  }
}

export function startLoanAutomation() {
  if (sweepTimer || reconcileTimer) return; // already running

  // Run once shortly after boot, then on their intervals.
  setTimeout(runSweep, 15_000);
  setTimeout(runReconcile, 30_000);

  sweepTimer = setInterval(runSweep, SWEEP_INTERVAL_MS);
  reconcileTimer = setInterval(runReconcile, RECONCILE_INTERVAL_MS);

  console.log('[scheduler] PayGo automation started (daily overdue sweep, 3-min MoMo reconciliation)');
}

export function stopLoanAutomation() {
  if (sweepTimer) clearInterval(sweepTimer);
  if (reconcileTimer) clearInterval(reconcileTimer);
  sweepTimer = null;
  reconcileTimer = null;
}
