import { Router, Request, Response } from 'express';
import { eq, desc, and, or, ilike, sql, inArray } from 'drizzle-orm';
import { parsePageParams, paginatedResponse, sendCsv } from '../lib/listQuery';
import { validate } from '../middleware/validate';
import { orderSchema } from '../lib/validation/schemas';
import { EmailService } from '../services/email.service';
import { MomoService } from '../services/momo.service';
import { LoanService, PayGoSequencingBlockError } from '../services/loan.service';
import { AgentService } from '../services/agent.service';
import { PaymentReconciliationService } from '../services/paymentReconciliation.service';
import { requireAdmin } from '../middleware/auth';
import { db } from '../config/database';
import { orders, orderItems, customers, products } from '../db/schema';
import { agents, loans, installments } from '../db/schema';
import { resolveNationalIdUpdate } from '../lib/fieldCrypto';
import { SmsService } from '../services/sms.service';

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

  // Resolve the agent (if any) this sale should be attributed to — a read,
  // fine to do before opening the transaction below.
  let agentId: number | null = null;
  if (agentIdOverride) {
    agentId = agentIdOverride;
  } else if (agentCode) {
    const agent = await AgentService.getAgentByCode(agentCode);
    if (agent && (agent.status === 'active' || agent.status === 'approved')) agentId = agent.id;
  }

  // ----------------------------------------
  // Everything from here down — resolving/creating the customer, the
  // order, its line items, and (for PayGo) the loan — runs as ONE
  // transaction. This closes a real bug: previously the order and its
  // items were committed to the database BEFORE the loan was attempted,
  // so a rejected PayGo request (e.g. the customer already has an unpaid
  // installment plan) left an orphaned "pending" order behind with no
  // financing attached to it — exactly the kind of dashboard clutter that
  // shouldn't exist. Now, if the loan request fails for any reason, the
  // order/items/customer changes made during this attempt all roll back
  // together — nothing is left in the database from a failed attempt.
  // ----------------------------------------
  interface CustomerNotifySnapshot { firstName: string; phone: string; email: string | null }
  // A mutable property on a `const` holder, not a reassigned `let` —
  // TypeScript's control-flow narrowing has a known issue tracking a
  // `let` variable's type correctly when it's assigned only inside an
  // async closure (like the db.transaction callback below) and read
  // afterward; wrapping it in a stable object sidesteps that entirely.
  const notify: { snapshot: CustomerNotifySnapshot | null } = { snapshot: null };

  try {
    const result = await db.transaction(async (tx) => {
      // Resolve the customer: either an existing one by ID (an agent
      // picking a customer they already registered) or find-or-create by
      // phone number (the normal web/USSD path).
      let customerId: number;
      if (existingCustomerIdInput) {
        const [found] = await tx.select().from(customers).where(eq(customers.id, existingCustomerIdInput));
        if (!found) throw new Error('Selected customer not found');
        if (found.agentId && agentId && found.agentId !== agentId) {
          throw new Error('This customer belongs to a different agent');
        }
        customerId = found.id;
        if (agentId && !found.agentId) {
          await tx.update(customers).set({ agentId, updatedAt: new Date() }).where(eq(customers.id, customerId));
        }
      } else {
        if (!customer) throw new Error('Customer details are required');
        const [existingCustomer] = await tx.select().from(customers).where(eq(customers.phone, customer.phone));

        if (existingCustomer) {
          customerId = existingCustomer.id;
          if (existingCustomer.agentId && agentId && existingCustomer.agentId !== agentId) {
            throw new Error('This customer already belongs to a different agent');
          }
          await tx
            .update(customers)
            .set({
              firstName: customer.firstName,
              lastName: customer.lastName,
              email: customer.email || existingCustomer.email,
              district: customer.district || existingCustomer.district,
              sector: customer.sector || existingCustomer.sector,
              cell: customer.cell || existingCustomer.cell,
              village: customer.village || existingCustomer.village,
              ...resolveNationalIdUpdate(customer.nationalId, existingCustomer.nationalId, existingCustomer.nationalIdHash),
              agentId: agentId ?? existingCustomer.agentId, // first agent attribution wins; doesn't get reassigned by a later order
              updatedAt: new Date(),
            })
            .where(eq(customers.id, customerId));
        } else {
          const [createdCustomer] = await tx
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
              ...resolveNationalIdUpdate(customer.nationalId, null, null),
              agentId,
              source: channel,
            })
            .returning();
          customerId = createdCustomer.id;
        }
      }

      const orderNumber = generateOrderNumber();
      const paymentInstructions = MomoService.generatePaymentInstructions(orderNumber);

      // Snapshot the customer's current name/phone/email onto the order row.
      const [resolvedCustomer] = await tx.select().from(customers).where(eq(customers.id, customerId));
      const customerSnapshot = {
        firstName: customer?.firstName ?? resolvedCustomer.firstName,
        lastName: customer?.lastName ?? resolvedCustomer.lastName,
        email: customer?.email ?? resolvedCustomer.email,
        phone: customer?.phone ?? resolvedCustomer.phone,
      };
      // Captured in the outer scope so the catch block below can send a
      // friendly explanation SMS even though the transaction is about to
      // roll back — this assignment survives a later throw in this
      // function because it's a plain JS variable, not a DB write.
      notify.snapshot = { firstName: customerSnapshot.firstName, phone: customerSnapshot.phone, email: customerSnapshot.email };

      const [order] = await tx
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

      await tx.insert(orderItems).values(
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
      // PayGo Installments: the connective tissue between the storefront
      // (or USSD), the customer record, and the loan module. `client: tx`
      // is what makes this participate in the SAME transaction as the
      // order above, instead of opening its own — see the comment on
      // LoanService.createLoan's `client` parameter for why that matters.
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
          client: tx,
        });
      }

      return { order, orderNumber, totalRwf, itemsWithSubtotal, paymentInstructions, loan: loanResult, customerId };
    });

    // ---- Order confirmation notification — fires for EVERY channel ----
    // Previously this only ran in the standalone POST /api/orders route
    // handler, so an order placed by an agent (or via USSD) never
    // triggered a customer confirmation email at all. Moving it into the
    // shared function means every entry point gets it automatically, with
    // no way for a future new channel to forget it.
    if (notify.snapshot?.email) {
      await EmailService.sendOrderConfirmation({
        orderNumber: result.orderNumber,
        customerName: result.order.customerName,
        customerEmail: notify.snapshot!.email,
        phone: notify.snapshot!.phone,
        items: result.itemsWithSubtotal,
        total: result.totalRwf,
        paymentMethod,
        ussdCode: result.paymentInstructions.ussdCode,
        reference: result.orderNumber,
        notes,
      }).catch((err) => console.error('Order confirmation email error (non-fatal):', err));
    } else {
      await EmailService.sendAdminNotification({
        orderNumber: result.orderNumber,
        customerName: result.order.customerName,
        customerPhone: notify.snapshot?.phone || result.order.customerPhone,
        total: result.totalRwf,
        paymentMethod,
        items: result.itemsWithSubtotal,
        notes,
      }).catch((err) => console.error('Admin notification email error (non-fatal):', err));
    }

    // Let the agent who made this sale know too, if there is one — an
    // agent should hear about their own sale succeeding without having to
    // go check the dashboard.
    if (agentId) {
      const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
      if (agent?.email) {
        await EmailService.sendAgentSaleNotification({
          agentName: agent.name,
          agentEmail: agent.email,
          orderNumber: result.orderNumber,
          customerName: result.order.customerName,
          totalRwf: result.totalRwf,
          isInstallment: Boolean(result.loan),
        }).catch((err) => console.error('Agent sale notification email error (non-fatal):', err));
      }
    }

    return result;
  } catch (error: any) {
    // Friendly, encouraging explanation sent directly to the customer
    // when the specific reason their order failed was the PayGo
    // sequencing/identity rule — not for other failures (insufficient
    // stock, validation errors, etc.), which don't need this framing and
    // whose messages aren't written for a customer to read.
    const isPayGoBlock = error instanceof PayGoSequencingBlockError;
    if (isPayGoBlock && notify.snapshot?.phone) {
      await SmsService.send(
        notify.snapshot!.phone,
        `Hi ${notify.snapshot!.firstName}, you already have an unpaid PayGo installment plan with KosmoPads. Please finish paying it first — once it's done, you're welcome to start a new one. Customers who pay well can unlock even better rates next time. Keep it up! — Kosmotive`
      ).catch((err) => console.error('PayGo-block explanation SMS error (non-fatal):', err));
    }
    throw error;
  }
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

        if (rawStatus === 'SUCCESSFUL') {
          await PaymentReconciliationService.markOrderPaid(order.id, { note: 'Confirmed via order status poll reconciliation' });
        } else if (rawStatus === 'FAILED') {
          await PaymentReconciliationService.markOrderFailed(order.id, momoStatus.reason || 'unspecified');
        }

        // Re-fetch so the response reflects the just-reconciled state
        [order] = await db.select().from(orders).where(eq(orders.id, order.id));
      } catch (reconcileErr) {
        // Non-fatal — MTN might be briefly unreachable; just report current DB state
        console.error('MoMo reconciliation during status poll failed (non-fatal):', reconcileErr);
      }
    }

    // ----------------------------------------
    // PayGo orders need to report something more honest than a flat
    // "paid" — order.paymentStatus turning 'paid' only ever means the
    // DOWN PAYMENT was received (that's what admin's "Confirm Paid"
    // button, or a MoMo push at checkout, is actually confirming for a
    // PayGo order — see PaymentReconciliationService). The remaining
    // balance is still owed across the installment schedule. Showing a
    // bare "Paid ✅ / Total: 21,000 RWF" for an order like that would
    // tell the customer their whole balance is settled when it isn't —
    // exactly the confusion this endpoint used to cause.
    let paygoSummary: {
      loanNumber: string;
      status: string;
      downPaymentRwf: number;
      totalPayableRwf: number;
      amountPaidRwf: number;
      remainingRwf: number;
      nextDueDate: string | null;
      nextDueAmountRwf: number | null;
    } | null = null;

    const [linkedLoan] = await db.select().from(loans).where(eq(loans.orderId, order.id));
    if (linkedLoan) {
      const loanInstallments = await db.select().from(installments).where(eq(installments.loanId, linkedLoan.id));
      const amountPaidRwf = loanInstallments.reduce((s, i) => s + (i.amountPaidRwf || 0), 0);
      const nextUnpaid = loanInstallments
        .filter((i) => i.status !== 'paid')
        .sort((a, b) => a.installmentNumber - b.installmentNumber)[0];

      paygoSummary = {
        loanNumber: linkedLoan.loanNumber,
        status: linkedLoan.status ?? 'active',
        downPaymentRwf: linkedLoan.downPaymentRwf ?? 0,
        totalPayableRwf: linkedLoan.totalPayableRwf,
        amountPaidRwf,
        remainingRwf: Math.max(0, linkedLoan.totalPayableRwf - amountPaidRwf),
        nextDueDate: nextUnpaid ? nextUnpaid.dueDate.toISOString() : null,
        nextDueAmountRwf: nextUnpaid ? nextUnpaid.amountDueRwf + (nextUnpaid.penaltyRwf || 0) - (nextUnpaid.amountPaidRwf || 0) : null,
      };
    }

    res.json({
      success: true,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      total: order.totalRwf,
      createdAt: order.createdAt,
      paygo: paygoSummary,
    });
  } catch (error) {
    console.error('Order status error:', error);
    res.status(500).json({ error: 'Failed to fetch order status' });
  }
});

// Builds the WHERE clause shared by the paginated list and the CSV export,
// so the two can never drift out of sync (e.g. export ignoring a filter
// the list applies).
function buildOrdersFilter(query: any, search: string) {
  const clauses = [];
  if (search) {
    const like = `%${search}%`;
    clauses.push(or(ilike(orders.orderNumber, like), ilike(orders.customerName, like), ilike(orders.customerPhone, like)));
  }
  if (query.orderStatus) clauses.push(eq(orders.orderStatus, String(query.orderStatus)));
  if (query.paymentStatus) clauses.push(eq(orders.paymentStatus, String(query.paymentStatus)));
  if (query.channel) clauses.push(eq(orders.channel, String(query.channel)));
  return clauses.length ? and(...clauses) : undefined;
}

// GET /api/orders (admin — paginated, searchable, filterable list)
// Search matches order #, customer name, or phone. Filters: orderStatus,
// paymentStatus, channel. Real SQL-level LIMIT/OFFSET so this stays fast
// as the orders table grows, instead of fetching every row and slicing in JS.
router.get('/', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parsePageParams(req.query);
    const where = buildOrdersFilter(req.query, params.search);

    const [rows, [{ count }]] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(params.pageSize)
        .offset(params.offset),
      db.select({ count: sql<number>`count(*)::int` }).from(orders).where(where),
    ]);

    // One extra query for the whole page, not one per row: which of these
    // orders have a PayGo loan, and is it fully paid off yet? This is what
    // lets the admin Orders list show "Down payment" instead of a bare
    // "paid" for a PayGo order that's only had its down payment confirmed
    // — the same honesty fix as the customer-facing order status page.
    const orderIds = rows.map((o) => o.id);
    const loanByOrderId = new Map<number, { status: string }>();
    if (orderIds.length > 0) {
      const loanRows = await db.select({ orderId: loans.orderId, status: loans.status }).from(loans).where(inArray(loans.orderId, orderIds));
      for (const l of loanRows) if (l.orderId) loanByOrderId.set(l.orderId, { status: l.status ?? 'active' });
    }

    res.json(
      paginatedResponse(
        rows.map((o) => ({
          orderNumber: o.orderNumber,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          totalRwf: o.totalRwf,
          orderStatus: o.orderStatus,
          paymentStatus: o.paymentStatus,
          paymentMethod: o.paymentMethod,
          channel: o.channel,
          createdAt: o.createdAt,
          paygoLoanStatus: loanByOrderId.get(o.id)?.status ?? null,
        })),
        count,
        params
      )
    );
  } catch (error) {
    console.error('List orders error:', error);
    res.status(500).json({ error: 'Failed to list orders' });
  }
});

// GET /api/orders/export/csv (admin) — same search/filters as the list
// above, but returns every matching row (no pagination) as a CSV download.
router.get('/export/csv', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parsePageParams(req.query);
    const where = buildOrdersFilter(req.query, params.search);
    const rows = await db.select().from(orders).where(where).orderBy(desc(orders.createdAt));
    sendCsv(
      res,
      `orders-${new Date().toISOString().slice(0, 10)}.csv`,
      ['orderNumber', 'customerName', 'customerPhone', 'totalRwf', 'orderStatus', 'paymentStatus', 'paymentMethod', 'channel', 'createdAt'],
      rows.map((o) => ({ ...o, createdAt: o.createdAt?.toISOString() }))
    );
  } catch (error) {
    console.error('Export orders CSV error:', error);
    res.status(500).json({ error: 'Failed to export orders' });
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

    const result = await PaymentReconciliationService.markOrderPaid(order.id, {
      momoReference: momoReference || order.momoReference || null,
      note: 'Confirmed manually by admin',
    });

    if (result.alreadyPaid) {
      res.json({ success: true, alreadyConfirmed: true, message: 'This order was already marked as paid.' });
      return;
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
