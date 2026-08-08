import { Router, Request, Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import { validate } from '../middleware/validate';
import { orderSchema } from '../lib/validation/schemas';
import { EmailService } from '../services/email.service';
import { MomoService } from '../services/momo.service';
import { requireAdmin } from '../middleware/auth';
import { db } from '../config/database';
import { orders, orderItems, customers, payments } from '../db/schema';

const router = Router();

function generateOrderNumber(): string {
  const d = new Date();
  const dateStr =
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `KOS-${dateStr}-${rand}`;
}

// POST /api/orders
router.post('/', validate(orderSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { customer, items, paymentMethod, notes } = req.body;

    let totalRwf = 0;
    const itemsWithSubtotal = items.map((item: any) => {
      const subtotal = item.price * item.quantity;
      totalRwf += subtotal;
      return item;
    });

    if (totalRwf < 2000) {
      res.status(400).json({ error: 'Minimum order amount is 2,000 FRW' });
      return;
    }

    // Find or create the customer record (matched by phone number)
    const [existingCustomer] = await db
      .select()
      .from(customers)
      .where(eq(customers.phone, customer.phone));

    let customerId: number;
    if (existingCustomer) {
      customerId = existingCustomer.id;
      await db
        .update(customers)
        .set({
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email || existingCustomer.email,
          district: customer.district || existingCustomer.district,
          village: customer.village || existingCustomer.village,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, customerId));
    } else {
      const [createdCustomer] = await db
        .insert(customers)
        .values({
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone,
          email: customer.email || null,
          district: customer.district || null,
          village: customer.village || null,
        })
        .returning();
      customerId = createdCustomer.id;
    }

    const orderNumber = generateOrderNumber();
    const paymentInstructions = MomoService.generatePaymentInstructions(orderNumber);

    const [order] = await db
      .insert(orders)
      .values({
        orderNumber,
        customerId,
        customerName: `${customer.firstName} ${customer.lastName}`,
        customerEmail: customer.email || null,
        customerPhone: customer.phone,
        totalRwf,
        paymentMethod,
        orderStatus: 'pending',
        paymentStatus: 'pending',
        notes: notes || null,
      })
      .returning();

    await db.insert(orderItems).values(
      itemsWithSubtotal.map((item: any) => ({
        orderId: order.id,
        productId: item.productId || null,
        productName: item.name,
        quantity: item.quantity,
        priceRwf: item.price,
        subtotalRwf: item.price * item.quantity,
      }))
    );

    // Send email if customer provided an email address
    if (customer.email) {
      await EmailService.sendOrderConfirmation({
        orderNumber,
        customerName: order.customerName,
        customerEmail: customer.email,
        phone: customer.phone,
        items: itemsWithSubtotal,
        total: totalRwf,
        paymentMethod,
        ussdCode: paymentInstructions.ussdCode,
        reference: orderNumber,
        notes,
      }).catch((err) => console.error('Email error (non-fatal):', err));
    } else {
      await EmailService.sendAdminNotification({
        orderNumber,
        customerName: order.customerName,
        customerPhone: customer.phone,
        total: totalRwf,
        paymentMethod,
        items: itemsWithSubtotal,
        notes,
      }).catch((err) => console.error('Admin email error (non-fatal):', err));
    }

    res.status(201).json({
      success: true,
      orderNumber,
      total: totalRwf,
      paymentInstructions,
      message: customer.email
        ? 'Order created! Check your email for payment instructions.'
        : 'Order created! Please pay using the instructions below.',
    });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// GET /api/orders/:orderNumber/status (public — customer order tracking)
// Also reconciles with MTN directly on every poll: sandbox (and occasionally
// production) webhook callbacks can be missed, so if our DB still shows
// "pending" but the order has a MoMo reference, we double-check live with
// MTN and self-heal the DB here rather than waiting indefinitely on a webhook.
router.get('/:orderNumber/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderNumber } = req.params;
    let [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (order.paymentStatus === 'pending' && order.momoReference) {
      try {
        const momoStatus = await MomoService.checkPaymentStatus(order.momoReference);
        const rawStatus = (momoStatus.status || '').toUpperCase();

        if (rawStatus === 'SUCCESSFUL' || rawStatus === 'FAILED') {
          const now = new Date();
          const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));

          if (rawStatus === 'SUCCESSFUL') {
            if (payment) {
              await db.update(payments).set({ status: 'paid', paidAt: now, notes: 'Confirmed via order status poll reconciliation', updatedAt: now }).where(eq(payments.id, payment.id));
            }
            await db.update(orders).set({ paymentStatus: 'paid', orderStatus: 'confirmed', updatedAt: now }).where(eq(orders.id, order.id));
            console.log(`✅ Order status poll reconciliation: order ${order.orderNumber} marked PAID`);

            if (order.customerEmail && payment) {
              const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
              await EmailService.sendPaymentReceipt({
                orderNumber: order.orderNumber,
                customerName: order.customerName,
                customerEmail: order.customerEmail,
                amountRwf: payment.amountRwf,
                paidAt: now,
                items: items.map((i) => ({ name: i.productName, quantity: i.quantity, priceRwf: i.priceRwf, subtotalRwf: i.subtotalRwf })),
              }).catch((err) => console.error('Receipt email error (non-fatal):', err));
            }
            await EmailService.sendAdminPaymentAlert({
              orderNumber: order.orderNumber,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              amountRwf: payment?.amountRwf ?? order.totalRwf,
              status: 'paid',
            }).catch((err) => console.error('Admin alert email error (non-fatal):', err));
          } else {
            if (payment) {
              await db.update(payments).set({ status: 'failed', notes: `Failed via order status poll. Reason: ${momoStatus.reason || 'unspecified'}`, updatedAt: now }).where(eq(payments.id, payment.id));
            }
            await db.update(orders).set({ paymentStatus: 'failed', updatedAt: now }).where(eq(orders.id, order.id));
          }

          // Re-fetch so the response reflects the just-reconciled state
          [order] = await db.select().from(orders).where(eq(orders.id, order.id));
        }
      } catch (reconcileErr) {
        // Non-fatal — MTN might be briefly unreachable; just report current DB state
        console.error('MoMo reconciliation during status poll failed (non-fatal):', reconcileErr);
      }
    }

    res.json({
      success: true,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      total: order.totalRwf,
      createdAt: order.createdAt,
    });
  } catch (error) {
    console.error('Order status error:', error);
    res.status(500).json({ error: 'Failed to fetch order status' });
  }
});

// GET /api/orders (admin — list all orders, most recent first)
router.get('/', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const all = await db.select().from(orders).orderBy(desc(orders.createdAt));
    res.json({
      success: true,
      total: all.length,
      orders: all.map((o) => ({
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        totalRwf: o.totalRwf,
        orderStatus: o.orderStatus,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
      })),
    });
  } catch (error) {
    console.error('List orders error:', error);
    res.status(500).json({ error: 'Failed to list orders' });
  }
});

// PATCH /api/orders/:orderNumber/confirm-payment (admin action)
// Used for both: (a) cash-on-delivery/pickup orders, where there is no
// automated gateway callback and the admin is confirming they physically
// received the money, and (b) MTN MoMo sandbox orders, where no real
// webhook will ever land, so the admin confirms manually after verifying
// the transaction on their phone.
router.patch('/:orderNumber/confirm-payment', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderNumber } = req.params;
    const { momoReference } = req.body;

    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (order.orderStatus === 'cancelled') {
      res.status(409).json({ error: 'This order was cancelled and cannot be confirmed.' });
      return;
    }

    if (order.paymentStatus === 'paid') {
      res.json({ success: true, alreadyConfirmed: true, message: 'This order was already marked as paid.' });
      return;
    }

    const now = new Date();
    await db
      .update(orders)
      .set({
        paymentStatus: 'paid',
        orderStatus: 'confirmed',
        momoReference: momoReference || order.momoReference || null,
        updatedAt: now,
      })
      .where(eq(orders.id, order.id));

    // Keep the payments ledger in sync too, if a row already exists for this order
    // (e.g. a MoMo push was initiated). Cash orders may not have one — that's fine.
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
    if (payment && payment.status !== 'paid') {
      await db
        .update(payments)
        .set({ status: 'paid', paidAt: now, notes: 'Confirmed manually by admin', updatedAt: now })
        .where(eq(payments.id, payment.id));
    }

    if (order.customerEmail) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      await EmailService.sendPaymentReceipt({
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        orderNumber: order.orderNumber,
        amountRwf: order.totalRwf,
        paidAt: now,
        items: items.map((i) => ({
          name: i.productName,
          quantity: i.quantity,
          priceRwf: i.priceRwf,
          subtotalRwf: i.subtotalRwf,
        })),
      }).catch((err) => console.error('Receipt email error (non-fatal):', err));
    }

    res.json({
      success: true,
      message: 'Payment confirmed and customer notified.',
      orderStatus: 'confirmed',
      paymentStatus: 'paid',
    });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// PATCH /api/orders/:orderNumber/status (admin — update order fulfilment status)
router.patch('/:orderNumber/status', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderNumber } = req.params;
    const { orderStatus } = req.body;
    const allowed = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(orderStatus)) {
      res.status(400).json({ error: `orderStatus must be one of: ${allowed.join(', ')}` });
      return;
    }

    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const updates: Record<string, unknown> = { orderStatus, updatedAt: new Date() };
    // Cancelling an order that was never paid also closes out its payment state,
    // so it stops showing up as "awaiting confirmation" on the dashboard.
    if (orderStatus === 'cancelled' && order.paymentStatus !== 'paid') {
      updates.paymentStatus = 'failed';
    }

    await db.update(orders).set(updates).where(eq(orders.id, order.id));
    res.json({ success: true, message: `Order marked as ${orderStatus}.` });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

export default router;
