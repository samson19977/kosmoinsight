import { eq, and, notInArray } from 'drizzle-orm';
import { db } from '../config/database';
import { orders, payments, orderItems } from '../db/schema';
import { InventoryService } from './inventory.service';
import { AgentService } from './agent.service';
import { EmailService } from './email.service';

// ============================================
// PaymentReconciliationService
//
// An order's payment can be confirmed from THREE independent places:
//   1. GET /api/payments/momo/status/:referenceId (frontend polling)
//   2. GET /api/orders/:orderNumber/status        (frontend polling, self-heal)
//   3. PATCH /api/orders/:orderNumber/confirm-payment (admin manual action)
//
// Previously each of those did its own "read the order, check if it's
// still pending, then write paid + deduct stock + record commission"
// sequence. That read-then-write is NOT atomic — two of these firing
// within the same moment (e.g. a customer's browser polling status at
// the exact instant an admin clicks "confirm payment") could both pass
// their own "still pending" check before either write lands, and both
// go on to deduct stock and (without AgentService's own guard) credit
// commission twice.
//
// This service is now the ONLY place that flips an order to paid/failed.
// The fix is a single atomic conditional UPDATE — Postgres guarantees
// only one caller's UPDATE can actually match a still-pending row, so
// whichever request's UPDATE returns 0 rows knows someone else already
// won the race, and skips every side effect (no double stock deduction,
// no double commission, no double email).
// ============================================
export class PaymentReconciliationService {
  // Atomically transitions an order (and its payment row, if one exists)
  // to paid, then runs the paid side effects — but ONLY if this call is
  // the one that actually performed the transition. Safe to call from
  // multiple places at once; only one will ever do the real work.
  static async markOrderPaid(orderId: number, opts: { momoReference?: string | null; note?: string } = {}) {
    const now = new Date();

    // The atomic guard: this UPDATE only matches (and only returns a row)
    // if paymentStatus was NOT already 'paid' at the moment Postgres
    // executes it — no other process can slip in between a read and this
    // write, because there is no separate read.
    const [updatedOrder] = await db
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
      return { alreadyPaid: true as const, order: null };
    }

    // Keep the payments ledger row in sync too, if one exists for this order.
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, orderId));
    if (payment && payment.status !== 'paid') {
      await db
        .update(payments)
        .set({ status: 'paid', paidAt: now, notes: opts.note || payment.notes, updatedAt: now })
        .where(eq(payments.id, payment.id));
    }

    // Side effects — each already has (or now has) its own idempotency
    // guard too, as defense-in-depth on top of the atomic UPDATE above.
    await InventoryService.deductStockForOrder(orderId);
    await AgentService.recordCommissionForOrder(orderId).catch((err) => console.error('Agent commission error (non-fatal):', err));

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

  // Same atomic-guard pattern for a failed payment — no side effects to
  // worry about here (nothing was ever deducted/credited), but we still
  // want to avoid two racing callers stomping on each other's `notes`.
  static async markOrderFailed(orderId: number, reason?: string) {
    const now = new Date();

    const [updatedOrder] = await db
      .update(orders)
      .set({ paymentStatus: 'failed', updatedAt: now })
      .where(and(eq(orders.id, orderId), notInArray(orders.paymentStatus, ['paid', 'failed'])))
      .returning();

    if (!updatedOrder) {
      return { alreadyProcessed: true as const, order: null };
    }

    const [payment] = await db.select().from(payments).where(eq(payments.orderId, orderId));
    if (payment && payment.status !== 'paid' && payment.status !== 'failed') {
      await db
        .update(payments)
        .set({ status: 'failed', notes: reason ? `Failed: ${reason}` : payment.notes, updatedAt: now })
        .where(eq(payments.id, payment.id));
    }

    return { alreadyProcessed: false as const, order: updatedOrder };
  }
}
