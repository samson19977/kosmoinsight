import { eq } from 'drizzle-orm';
import { db } from '../config/database';
import { products, orderItems, stockMovements } from '../db/schema';

export class InventoryService {
  // Deducts stock for every line item on an order. This is called exactly
  // once, at the moment an order's payment is actually confirmed — whether
  // that's a cash/manual admin confirmation, a live MTN MoMo webhook, or a
  // status-poll self-heal — never at order creation (a pending order hasn't
  // actually sold anything yet, and cash orders may never get paid).
  //
  // Every call sites guards against double-confirming an already-paid order
  // before calling this, so this itself doesn't need its own idempotency
  // check — but it's written defensively (clamped at 0, never throws) so a
  // stock hiccup never blocks a payment confirmation from completing.
  static async deductStockForOrder(orderId: number): Promise<void> {
    try {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

      for (const item of items) {
        if (!item.productId) continue; // custom/unlinked line item — nothing to deduct

        const [product] = await db.select().from(products).where(eq(products.id, item.productId));
        if (!product) continue;

        const currentStock = product.stock ?? 0;
        const newStock = Math.max(0, currentStock - item.quantity);
        const wasInsufficient = currentStock < item.quantity;

        await db
          .update(products)
          .set({ stock: newStock, updatedAt: new Date() })
          .where(eq(products.id, product.id));

        await db.insert(stockMovements).values({
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
    } catch (error) {
      // Never let a stock-tracking failure block a payment confirmation —
      // log loudly so it can be caught and corrected manually.
      console.error(`❌ Stock deduction failed for order #${orderId}:`, error);
    }
  }
}
