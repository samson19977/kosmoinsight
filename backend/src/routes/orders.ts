import { Router, Request, Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import { validate } from '../middleware/validate';
import { orderSchema } from '../lib/validation/schemas';
import { EmailService } from '../services/email.service';
import { MomoService } from '../services/momo.service';
import { InventoryService } from '../services/inventory.service';
import { LoanService } from '../services/loan.service';
import { AgentService } from '../services/agent.service';
import { requireAdmin } from '../middleware/auth';
import { db } from '../config/database';
import { orders, orderItems, customers, payments, products } from '../db/schema';

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

// ==========================================================
// Shared order-creation core — used by the REST route below AND by the
// USSD handler (routes/ussd.ts), so a purchase made with no smartphone
// goes through exactly the same validation, agent attribution,
// installment-eligibility checks, and PayGo loan creation as one made on
// the website. One code path, two entry points.
// ==========================================================
export async function createOrderCore(input: {
  customer?: any;
  customerId?: number;
  items: Array<{ name: string; quantity: number; price: number; productId?: number }>;
  paymentMethod: string;
  installmentPlan?: { downPaymentRwf: number; termMonths: number; interestRateBps?: number; guarantorName?: string; guarantorPhone?: string; agreementAccepted?: boolean };
  agentCode?: string;
  // Captured from the HTTP request by the route handler (never
  // client-supplied as JSON) so the loan agreement record reflects the
  // real request that opened it.
  ipAddress?: string;
  userAgent?: string;
  // Set by the agent-authenticated route ONLY, from the verified JWT —
  // never accepted from client-supplied JSON. Takes priority over
  // agentCode so an agent's own sale is always attributed to themselves,
  // with no way to spoof a different agent's code.
  agentIdOverride?: number;
  channel?: 'web' | 'ussd' | 'agent';
  notes?: string;
}) {
  const { customer, customerId: existingCustomerIdInput, items, paymentMethod, installmentPlan, agentCode, agentIdOverride, channel = 'web', notes, ipAddress, userAgent } = input;

  let totalRwf = 0;
  const itemsWithSubtotal = items.map((item) => {
    const subtotal = item.price * item.quantity;
    totalRwf += subtotal;
    return item;
  });

  if (totalRwf < 2000) {
    throw new Error('Minimum order amount is 2,000 FRW');
  }

  const isInstallment = paymentMethod === 'PayGo Installments';

  // PayGo Installments is restricted to specific products (currently only
  // Medium Package) — enforced here against the live products table, not
  // just hidden in the UI, so the rule holds regardless of entry point
  // (web, USSD, or an agent recording a sale).
  if (isInstallment) {
    if (!installmentPlan) throw new Error('Installment plan is required for PayGo Installments');
    if (installmentPlan.downPaymentRwf >= totalRwf) {
      throw new Error('Down payment must be less than the order total — otherwise there is nothing to finance');
    }
    if (!installmentPlan.agreementAccepted) {
      throw new Error('The customer must review and accept the PayGo terms before this loan can be created');
    }
    const productIds = items.map((i) => i.productId).filter((id): id is number => Boolean(id));
    if (productIds.length !== items.length) {
      throw new Error('PayGo Installments requires every item to reference a real product (missing productId)');
    }
    const eligibleProducts = await db.select().from(products);
    for (const item of items) {
      const product = eligibleProducts.find((p) => p.id === item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);
      if (!product.installmentEligible) {
        throw new Error(`"${product.name}" is not eligible for PayGo Installments — only Medium Package can be financed. Please pay the full amount via MoMo or cash, or remove it from this order.`);
      }
    }
  }

  // Resolve the agent (if any) this sale should be attributed to.
  // agentIdOverride (set only by the authenticated agent route, from the
  // verified JWT) always wins over a client-supplied agentCode — an agent
  // can never place a sale under someone else's identity.
  let agentId: number | null = null;
  if (agentIdOverride) {
    agentId = agentIdOverride;
  } else if (agentCode) {
    const agent = await AgentService.getAgentByCode(agentCode);
    if (agent && (agent.status === 'active' || agent.status === 'approved')) agentId = agent.id;
  }

  // Resolve the customer: either an existing one by ID (an agent picking a
  // customer they already registered) or find-or-create by phone number
  // (the normal web/USSD path). Location and National ID are captured
  // whenever provided — not just for installment orders — so a customer's
  // profile fills in over repeat purchases, and an update never blanks
  // out a field given previously.
  let customerId: number;
  if (existingCustomerIdInput) {
    const [found] = await db.select().from(customers).where(eq(customers.id, existingCustomerIdInput));
    if (!found) throw new Error('Selected customer not found');
    // An agent may only transact against their OWN customers, or an
    // unclaimed one (agentId null) which then becomes theirs.
    if (found.agentId && agentId && found.agentId !== agentId) {
      throw new Error('This customer belongs to a different agent');
    }
    customerId = found.id;
    if (agentId && !found.agentId) {
      await db.update(customers).set({ agentId, updatedAt: new Date() }).where(eq(customers.id, customerId));
    }
  } else {
    if (!customer) throw new Error('Customer details are required');
    const [existingCustomer] = await db.select().from(customers).where(eq(customers.phone, customer.phone));

    if (existingCustomer) {
      customerId = existingCustomer.id;
      if (existingCustomer.agentId && agentId && existingCustomer.agentId !== agentId) {
        throw new Error('This customer already belongs to a different agent');
      }
      await db
        .update(customers)
        .set({
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email || existingCustomer.email,
          district: customer.district || existingCustomer.district,
          sector: customer.sector || existingCustomer.sector,
          cell: customer.cell || existingCustomer.cell,
          village: customer.village || existingCustomer.village,
          nationalId: customer.nationalId || existingCustomer.nationalId,
          agentId: agentId ?? existingCustomer.agentId, // first agent attribution wins; doesn't get reassigned by a later order
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
          sector: customer.sector || null,
          cell: customer.cell || null,
          village: customer.village || null,
          nationalId: customer.nationalId || null,
          agentId,
          source: channel,
        })
        .returning();
      customerId = createdCustomer.id;
    }
  }

  const orderNumber = generateOrderNumber();
  const paymentInstructions = MomoService.generatePaymentInstructions(orderNumber);

  // Snapshot the customer's current name/phone/email onto the order row —
  // works whether `customer` was passed inline or resolved by customerId.
  const [resolvedCustomer] = await db.select().from(customers).where(eq(customers.id, customerId));
  const customerSnapshot = {
    firstName: customer?.firstName ?? resolvedCustomer.firstName,
    lastName: customer?.lastName ?? resolvedCustomer.lastName,
    email: customer?.email ?? resolvedCustomer.email,
    phone: customer?.phone ?? resolvedCustomer.phone,
  };

  const [order] = await db
    .insert(orders)
    .values({
      orderNumber,
      customerId,
      customerName: `${customerSnapshot.firstName} ${customerSnapshot.lastName}`,
      customerEmail: customerSnapshot.email || null,
      customerPhone: customerSnapshot.phone,
      totalRwf,
      paymentMethod,
      orderStatus: 'pending',
      paymentStatus: 'pending',
      agentId,
      channel,
      notes: notes || null,
    })
    .returning();

  await db.insert(orderItems).values(
    itemsWithSubtotal.map((item) => ({
      orderId: order.id,
      productId: item.productId || null,
      productName: item.name,
      quantity: item.quantity,
      priceRwf: item.price,
      subtotalRwf: item.price * item.quantity,
    }))
  );

  // ----------------------------------------
  // PayGo Installments: the connective tissue between the storefront (or
  // USSD), the customer record, and the loan module. The order represents
  // the sale; the loan represents financing what's left after the down
  // payment. Both point back to the same order/customer, so nothing needs
  // reconciling by hand afterward.
  // ----------------------------------------
  let loanResult: Awaited<ReturnType<typeof LoanService.createLoan>> | null = null;
  if (isInstallment && installmentPlan) {
    loanResult = await LoanService.createLoan({
      orderId: order.id,
      customerId,
      principalRwf: totalRwf,
      downPaymentRwf: installmentPlan.downPaymentRwf,
      interestRateBps: installmentPlan.interestRateBps ?? 0,
      termMonths: installmentPlan.termMonths,
      guarantorType: installmentPlan.guarantorName ? 'individual' : 'none',
      guarantorName: installmentPlan.guarantorName || undefined,
      guarantorPhone: installmentPlan.guarantorPhone || undefined,
      notes: `Opened from ${channel} checkout, order ${orderNumber}`,
      agreement: { agentId, ipAddress, userAgent },
    });
  }

  return { order, orderNumber, totalRwf, itemsWithSubtotal, paymentInstructions, loan: loanResult, customerId };
}

// POST /api/orders
router.post('/', validate(orderSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { customer, items, paymentMethod, notes, installmentPlan, agentCode, channel } = req.body;

    const { order, orderNumber, totalRwf, itemsWithSubtotal, paymentInstructions, loan } = await createOrderCore({
      customer, items, paymentMethod, installmentPlan, agentCode, channel: channel || 'web', notes,
      ipAddress: req.ip, userAgent: req.headers['user-agent'],
    });

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
      // Present when paymentMethod === 'PayGo Installments'. The frontend
      // should push MoMo (or collect cash) for downPaymentRwf specifically —
      // NOT the full order total, since the rest is financed.
      loan: loan
        ? {
            loanNumber: loan.loanNumber,
            principalRwf: loan.principalRwf,
            downPaymentRwf: loan.downPaymentRwf,
            totalPayableRwf: loan.totalPayableRwf,
            termMonths: loan.termMonths,
            expectedPayoffDate: loan.expectedPayoffDate,
          }
        : null,
      message: customer.email
        ? 'Order created! Check your email for payment instructions.'
        : 'Order created! Please pay using the instructions below.',
    });
  } catch (error: any) {
    console.error('Order creation error:', error);
    const isClientError = /minimum order|installment|eligible|down payment/i.test(error.message || '');
    res.status(isClientError ? 400 : 500).json({ error: error.message || 'Failed to create order' });
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
            await InventoryService.deductStockForOrder(order.id);
            await AgentService.recordCommissionForOrder(order.id).catch((err) => console.error('Agent commission error (non-fatal):', err));
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

    await InventoryService.deductStockForOrder(order.id);
    await AgentService.recordCommissionForOrder(order.id).catch((err) => console.error('Agent commission error (non-fatal):', err));

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
