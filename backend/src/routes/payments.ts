import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { MomoService } from '../services/momo.service';
import { validate } from '../middleware/validate';
import { momoPaymentSchema } from '../lib/validation/schemas';
import { db } from '../config/database';
import { orders, payments } from '../db/schema';
import { PaymentReconciliationService } from '../services/paymentReconciliation.service';

const router = Router();

// ============================================
// POST /api/payments/momo/initiate
// Initiates a Request-to-Pay with MTN MoMo AND persists
// a payments row so the webhook can update it later.
// ============================================
router.post('/momo/initiate', validate(momoPaymentSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, amount, reference, description } = req.body;

    // Look up the order by order number (reference) so we can link the payment row
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, reference));

    if (!order) {
      res.status(404).json({ error: `Order "${reference}" not found. Cannot initiate payment.` });
      return;
    }

    if (order.paymentStatus === 'paid') {
      res.status(400).json({ error: 'This order has already been paid.' });
      return;
    }

    // Call MoMo API
    const result = await MomoService.initiatePayment({ phone, amount, reference, description });

    if (!result.success) {
      res.status(400).json({ success: false, message: result.message });
      return;
    }

    // Persist the payment row (upsert by momoTransactionId to avoid duplicates on retry)
    const [payment] = await db
      .insert(payments)
      .values({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amountRwf: amount,
        paymentMethod: 'momo',
        phone,
        momoTransactionId: result.transactionId || null,
        momoReference: reference,
        status: result.status === 'pending_manual' ? 'pending_manual' : 'pending',
        notes: result.message,
      })
      .returning();

    // Also stamp the momoReference on the order so the webhook can find it by transactionId
    await db
      .update(orders)
      .set({ momoReference: result.transactionId || reference, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    res.json({
      success: true,
      paymentId: payment.id,
      transactionId: result.transactionId,
      status: result.status,
      message: result.message,
      paymentInstructions: MomoService.generatePaymentInstructions(reference),
    });
  } catch (error) {
    console.error('MoMo initiate error:', error);
    res.status(500).json({ error: 'Failed to initiate payment' });
  }
});

// ============================================
// GET /api/payments/momo/status/:referenceId
// Polls MoMo API for the current payment status AND reconciles our own
// database with it. This exists because MTN's webhook callbacks are known
// to be unreliable in sandbox (and can occasionally be missed/delayed in
// production too) — so every status poll is also a self-healing check:
// if MTN says SUCCESSFUL/FAILED and our DB still shows pending, we update
// it here rather than waiting indefinitely on a webhook that may never arrive.
// ============================================
router.get('/momo/status/:referenceId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { referenceId } = req.params;
    const status = await MomoService.checkPaymentStatus(referenceId);

    // Try to reconcile against our own payment/order records
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.momoTransactionId, referenceId));

    if (payment && payment.status !== 'paid' && payment.status !== 'failed') {
      const rawStatus = (status.status || '').toUpperCase();

      if (rawStatus === 'SUCCESSFUL') {
        const result = await PaymentReconciliationService.markOrderPaid(payment.orderId, {
          note: 'Confirmed via status poll reconciliation',
        });
        if (!result.alreadyPaid) {
          console.log(`✅ Status-poll reconciliation: order ${result.order!.orderNumber} marked PAID`);
        }
      } else if (rawStatus === 'FAILED') {
        await PaymentReconciliationService.markOrderFailed(payment.orderId, status.reason || 'unspecified');
      }
    }

    res.json({ success: true, referenceId, ...status });
  } catch (error) {
    console.error('MoMo status error:', error);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// ============================================
// POST /api/payments/instructions
// Returns manual USSD instructions without initiating an API call.
// ============================================
router.post('/instructions', (req: Request, res: Response): void => {
  const { reference } = req.body;
  if (!reference) {
    res.status(400).json({ error: 'Reference is required' });
    return;
  }
  const instructions = MomoService.generatePaymentInstructions(reference);
  res.json({ success: true, ...instructions });
});

export default router;
