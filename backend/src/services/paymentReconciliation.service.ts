import { eq, and, notInArray } from 'drizzle-orm';
import { db } from '../config/database';
import { orders, payments, orderItems } from '../db/schema';
import { InventoryService } from './inventory.service';
import { AgentService } from './agent.service';
import { EmailService } from './email.service';

// ============================================
// PaymentReconciliationService
//
// An order's payment can be confirmed from FOUR independent places:
//   1. POST /api/webhooks/momo                       (live MTN callback)
//   2. GET  /api/payments/momo/status/:referenceId    (frontend polling)
//   3. GET  /api/orders/:orderNumber/status           (frontend polling, self-heal)
//   4. PATCH /api/orders/:orderNumber/confirm-payment (admin manual action)
//
// Two problems used to exist here, and both are fixed in this file:
//
// (1) RACE CONDITION — each path used to do its own "read the order,
//     check if it's still pending, then write paid + deduct stock +
//     record commission." That read-then-write is NOT atomic — two of
//     these firing within the same moment (e.g. a customer's browser
//     polling status at the exact instant an admin clicks "confirm
//     payment") could both pass their own "still pending" check before
//     either write lands, and both go on to deduct stock twice.
//     Fixed by a single atomic conditional UPDATE below — Postgres
//     guarantees only one caller's UPDATE can match a still-pending row.
//
// (2) PARTIAL-FAILURE / NO ATOMICITY ACROSS STEPS — even after fixing
//     the race on the order's own status flip, the follow-on steps
//     (payments-row update, stock deduction, commission credit) were
//     each separate statements outside any transaction. A crash or DB
//     error between them used to leave the order marked "paid" while
//     stock was never deducted or commission never credited — a state
//     nobody would notice until a customer complained about a stock
//     count, or an agent complained about a missing payout.
//     Fixed by wrapping every DB write for one reconciliation in a
//     SINGLE transaction: either the entire thing lands together, or
//     none of it does and the order stays exactly as it was, ready to
//     be retried cleanly on the next poll/webhook redelivery.
//
// Emails are intentionally sent AFTER the transaction commits — they're
// best-effort notifications, not data integrity, and holding a DB
// transaction open across a slow external email API call is its own
// kind of risk (connection pool exhaustion under load).
// ============================================
export class PaymentReconciliationService {
  static async markOrderPaid(orderId: number, opts: { momoReference?: string | null; note?: string } = {}) {
    const now = new Date();

    const result = await db.transaction(async (tx) => {
      // The atomic guard: this UPDATE only matches (and only returns a
      // row) if paymentStatus was NOT already 'paid' at the moment
      // Postgres executes it — no other process can slip in between a
      // read and this write, because there is no separate read.
      const [updatedOrder] = await tx
        .update(orders)
        .set({
          paymentStatus: 'paid',
          orderStatus: 'confirmed',
          momoReference: opts.momoReference ?? undefined,
          updatedAt: now,
        })
        .where(and(eq(orders.id, orderId), notInArray(orders.paymentStatus, ['paid'])))
        .returning();

      if (!updatedOrder) {
        // Someone else already confirmed this order — nothing more to do.
        return { alreadyPaid: true as const, order: null, payment: null };
      }

      // Keep the payments ledger row in sync too, if one exists for this order.
      const [payment] = await tx.select().from(payments).where(eq(payments.orderId, orderId));
      if (payment && payment.status !== 'paid') {
        await tx
          .update(payments)
          .set({ status: 'paid', paidAt: now, notes: opts.note || payment.notes, updatedAt: now })
          .where(eq(payments.id, payment.id));
      }

      // Side effects run INSIDE the same transaction now — if either of
      // these throws, the order-status flip above rolls back too, so we
      // never end up with "paid" but no stock movement / no commission.
      await InventoryService.deductStockForOrder(orderId, tx);
      await AgentService.recordCommissionForOrder(orderId, tx);

      return { alreadyPaid: false as const, order: updatedOrder, payment };
    });

    if (result.alreadyPaid || !result.order) {
      return { alreadyPaid: true as const, order: null };
    }

    const { order: updatedOrder, payment } = result;

    // Best-effort notifications — outside the transaction, never allowed
    // to affect whether the payment itself was recorded correctly.
    if (updatedOrder.customerEmail) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      await EmailService.sendPaymentReceipt({
        orderNumber: updatedOrder.orderNumber,
        customerName: updatedOrder.customerName,
        customerEmail: updatedOrder.customerEmail,
        amountRwf: payment?.amountRwf ?? updatedOrder.totalRwf,
        paidAt: now,
        items: items.map((i) => ({ name: i.productName, quantity: i.quantity, priceRwf: i.priceRwf, subtotalRwf: i.subtotalRwf })),
      }).catch((err) => console.error('Receipt email error (non-fatal):', err));
    }

    await EmailService.sendAdminPaymentAlert({
      orderNumber: updatedOrder.orderNumber,
      customerName: updatedOrder.customerName,
      customerPhone: updatedOrder.customerPhone,
      amountRwf: payment?.amountRwf ?? updatedOrder.totalRwf,
      status: 'paid',
    }).catch((err) => console.error('Admin alert email error (non-fatal):', err));

    return { alreadyPaid: false as const, order: updatedOrder };
  }

  // Same atomic-guard + transaction pattern for a failed payment. No
  // stock/commission side effects to worry about here (nothing was ever
  // deducted/credited), but the order + payment rows still update
  // together as one unit rather than as two separate statements.
  static async markOrderFailed(orderId: number, reason?: string) {
    const now = new Date();

    return db.transaction(async (tx) => {
      const [updatedOrder] = await tx
        .update(orders)
        .set({ paymentStatus: 'failed', updatedAt: now })
        .where(and(eq(orders.id, orderId), notInArray(orders.paymentStatus, ['paid', 'failed'])))
        .returning();

      if (!updatedOrder) {
        return { alreadyProcessed: true as const, order: null };
      }

      const [payment] = await tx.select().from(payments).where(eq(payments.orderId, orderId));
      if (payment && payment.status !== 'paid' && payment.status !== 'failed') {
        await tx
          .update(payments)
          .set({ status: 'failed', notes: reason ? `Failed: ${reason}` : payment.notes, updatedAt: now })
          .where(eq(payments.id, payment.id));
      }

      return { alreadyProcessed: false as const, order: updatedOrder };
    });
  }
}
