import { Router, Request, Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import { validate } from '../middleware/validate';
import { orderSchema } from '../lib/validation/schemas';
import { EmailService } from '../services/email.service';
import { MomoService } from '../services/momo.service';
import { requireAdmin } from '../middleware/auth';
import { db } from '../config/database';
import { orders, orderItems, customers } from '../db/schema';

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
router.get('/:orderNumber/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderNumber } = req.params;
    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.json({
      success: true,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
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
router.patch('/:orderNumber/confirm-payment', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderNumber } = req.params;
    const { momoReference } = req.body;

    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    await db
      .update(orders)
      .set({
        paymentStatus: 'paid',
        orderStatus: 'confirmed',
        momoReference: momoReference || null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    if (order.customerEmail) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      await EmailService.sendPaymentReceipt({
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        orderNumber: order.orderNumber,
        amountRwf: order.totalRwf,
        paidAt: new Date(),
        items: items.map((i) => ({
          name: i.productName,
          quantity: i.quantity,
          priceRwf: i.priceRwf,
          subtotalRwf: i.subtotalRwf,
        })),
      }).catch((err) => console.error('Receipt email error (non-fatal):', err));
    }

    res.json({ success: true, message: 'Payment confirmed and customer notified.' });
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

    await db.update(orders).set({ orderStatus, updatedAt: new Date() }).where(eq(orders.id, order.id));
    res.json({ success: true, message: `Order marked as ${orderStatus}.` });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

export default router;
