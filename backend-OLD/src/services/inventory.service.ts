import { eq, and } from 'drizzle-orm';
import { db, DbClient } from '../config/database';
import { products, orderItems, stockMovements } from '../db/schema';

export class InventoryService {
  // Deducts stock for every line item on an order. This is called exactly
  // once, at the moment an order's payment is actually confirmed — whether
  // that's a cash/manual admin confirmation, a live MTN MoMo webhook, or a
  // status-poll self-heal — all funneled through
  // PaymentReconciliationService, which calls this INSIDE the same DB
  // transaction as the order's payment-status update (pass its `tx` as
  // `client` below).
  //
  // Idempotency guard: if stock for this order was already deducted, skip
  // silently rather than deducting twice — defense-in-depth on top of the
  // atomic order-status transition in PaymentReconciliationService.
  //
  // Design note: this used to swallow every error ("never let a stock
  // failure block a payment confirmation"). That's the wrong trade-off for
  // a transaction-wrapped call — swallowing here would let a real DB error
  // slip through with the order still marked paid but stock silently never
  // deducted. Errors now propagate, so the caller's transaction rolls back
  // the WHOLE reconciliation (order goes back to unpaid) and a later retry
  // (poll/webhook redelivery) can complete it cleanly instead of leaving a
  // half-done state that nobody notices.
  static async deductStockForOrder(orderId: number, client: DbClient = db): Promise<void> {
    const [alreadyDeducted] = await client
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(and(eq(stockMovements.orderId, orderId), eq(stockMovements.reason, 'sale')))
      .limit(1);
    if (alreadyDeducted) {
      console.log(`Stock already deducted for order ${orderId} — skipping duplicate deduction.`);
      return;
    }

    const items = await client.select().from(orderItems).where(eq(orderItems.orderId, orderId));

    for (const item of items) {
      if (!item.productId) continue; // custom/unlinked line item — nothing to deduct

      const [product] = await client.select().from(products).where(eq(products.id, item.productId));
      if (!product) continue;

      const currentStock = product.stock ?? 0;
      const newStock = Math.max(0, currentStock - item.quantity);
      const wasInsufficient = currentStock < item.quantity;

      await client
        .update(products)
        .set({ stock: newStock, updatedAt: new Date() })
        .where(eq(products.id, product.id));

      await client.insert(stockMovements).values({
        productId: product.id,
        changeQty: -item.quantity,
        reason: 'sale',
        orderId,
        adminId: null,
        note: wasInsufficient
          ? `Stock was insufficient at confirmation time (${currentStock} available, ${item.quantity} sold) — clamped to 0. Review this product.`
          : null,
      });

      if (wasInsufficient) {
        console.warn(
          `⚠️ Stock discrepancy on product #${product.id} (${product.name}) for order #${orderId}: had ${currentStock}, sold ${item.quantity}.`
        );
      }
    }
  }
}
