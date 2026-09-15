import { Router, Request, Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../config/database';
import { products, orders, customers, loans, installments } from '../db/schema';
import { createOrderCore } from './orders';
import { MomoService } from '../services/momo.service';

const router = Router();

// ==========================================================
// USSD gateway — Africa's Talking-compatible request shape:
//   POST body: { sessionId, serviceCode, phoneNumber, text }
// `text` accumulates every screen's answer, `*`-separated, across the
// whole session (e.g. "1*2*3" = picked menu 1, then 2, then 3). There is
// no need for server-side session storage — the full path so far always
// arrives on every request — which also means this works correctly even
// if the platform runs on more than one server instance.
//
// This is the SAME entry point a customer without a smartphone or data
// bundle uses to buy pads, including PayGo installments — it calls the
// exact same createOrderCore() the website checkout calls, so an order
// placed over USSD is indistinguishable in the database from one placed
// on the web, other than `channel: 'ussd'`.
//
// Response must start with "CON" (session continues, more input expected)
// or "END" (session terminates) and be text/plain — that is the USSD
// gateway's protocol, not a KosmoPads convention.
// ==========================================================

function normalizePhone(raw: string): string {
  const digits = (raw || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+250')) return digits;
  if (digits.startsWith('250')) return '+' + digits;
  if (digits.startsWith('0')) return '+250' + digits.slice(1);
  return digits;
}

const DOWN_PAYMENT_OPTIONS = [30, 50, 70]; // percent
const TERM_OPTIONS = [3, 6, 12]; // months

router.post('/', async (req: Request, res: Response): Promise<void> => {
  res.set('Content-Type', 'text/plain');

  try {
    const { text = '', phoneNumber } = req.body;
    const phone = normalizePhone(phoneNumber || '');
    const step = text === '' ? [] : String(text).split('*');

    // ---------- Main menu ----------
    if (step.length === 0) {
      res.send('CON Welcome to KosmoPads\n1. Buy pads\n2. Track my order\n3. Check my PayGo loan');
      return;
    }

    // ================= BRANCH: Track order =================
    if (step[0] === '2') {
      if (step.length === 1) {
        res.send('CON Enter your Order Number\n(e.g. KOS-20260811-1234)');
        return;
      }
      if (step.length === 2) {
        const orderNumber = step[1].trim().toUpperCase();
        const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
        if (!order || order.customerPhone !== phone) {
          res.send('END Order not found for this phone number. Please check the Order Number and try again.');
          return;
        }
        res.send(
          `END Order ${order.orderNumber}\nStatus: ${order.orderStatus}\nPayment: ${order.paymentStatus}\nTotal: ${order.totalRwf} RWF`
        );
        return;
      }
    }

    // ================= BRANCH: PayGo loan status =================
    if (step[0] === '3') {
      if (step.length === 1) {
        res.send('CON Enter your Loan Number\n(e.g. PGO-20260811-1234)');
        return;
      }
      if (step.length === 2) {
        const loanNumber = step[1].trim().toUpperCase();
        const [loan] = await db.select().from(loans).where(eq(loans.loanNumber, loanNumber));
        if (!loan) { res.send('END Loan not found.'); return; }
        const [customer] = await db.select().from(customers).where(eq(customers.id, loan.customerId));
        if (!customer || customer.phone !== phone) {
          res.send('END Loan not found for this phone number.');
          return;
        }
        const schedule = await db.select().from(installments).where(eq(installments.loanId, loan.id));
        const paid = schedule.reduce((s, i) => s + (i.amountPaidRwf || 0), 0);
        const due = schedule.reduce((s, i) => s + (i.amountDueRwf || 0), 0);
        const next = schedule.sort((a, b) => a.installmentNumber - b.installmentNumber).find((i) => i.status !== 'paid');
        res.send(
          `END Loan ${loan.loanNumber}\nStatus: ${loan.status}\nPaid: ${paid}/${due} RWF\n` +
          (next ? `Next due: ${next.amountDueRwf} RWF on ${new Date(next.dueDate).toLocaleDateString()}` : 'Fully paid off!')
        );
        return;
      }
    }

    // ================= BRANCH: Buy pads =================
    if (step[0] === '1') {
      const allProducts = (await db.select().from(products)).filter((p) => p.isActive).sort((a, b) => a.id - b.id);

      // ---- Step 1: product list ----
      if (step.length === 1) {
        const lines = allProducts.map((p, i) => `${i + 1}. ${p.name} - ${p.priceRwf} RWF`);
        res.send(`CON Choose a product:\n${lines.join('\n')}`);
        return;
      }

      const productIndex = parseInt(step[1], 10) - 1;
      const product = allProducts[productIndex];
      if (!product) { res.send('END Invalid product selection. Please dial again.'); return; }

      // ---- Step 2: quantity ----
      if (step.length === 2) {
        res.send(`CON ${product.name} — ${product.priceRwf} RWF each\nEnter quantity (1-10):`);
        return;
      }
      const quantity = parseInt(step[2], 10);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
        res.send('END Invalid quantity. Please dial again and enter a number from 1 to 10.');
        return;
      }
      const totalRwf = product.priceRwf * quantity;

      // ---- Step 3: full payment vs PayGo installments ----
      if (step.length === 3) {
        if (product.installmentEligible) {
          res.send('CON How would you like to pay?\n1. Pay in full now\n2. Pay in installments (PayGo)');
        } else {
          res.send('CON How would you like to pay?\n1. Pay in full now\n(PayGo Installments is only available on Medium Package)');
        }
        return;
      }
      const purchaseType = step[3];

      if (purchaseType === '2' && !product.installmentEligible) {
        res.send(`END Sorry, PayGo Installments is only available on Medium Package. ${product.name} must be paid in full.`);
        return;
      }
      if (purchaseType !== '1' && purchaseType !== '2') {
        res.send('END Invalid selection. Please dial again.');
        return;
      }

      // ============ SUB-BRANCH: full payment ============
      if (purchaseType === '1') {
        if (step.length === 4) {
          res.send('CON Payment method:\n1. MTN MoMo\n2. Cash on delivery/pickup');
          return;
        }
        const paymentMethodChoice = step[4];
        if (step.length === 5) {
          res.send('CON Enter your full name\n(First Last):');
          return;
        }
        const fullName = step[5]?.trim();
        if (step.length === 6) {
          res.send('CON Enter your District:');
          return;
        }
        const district = step[6]?.trim();

        if (step.length === 7) {
          const [firstName, ...rest] = (fullName || 'USSD Customer').split(' ');
          const lastName = rest.join(' ') || '-';
          const paymentMethod = paymentMethodChoice === '1' ? 'Mobile Money (MTN / Airtel)' : 'Cash on Delivery';

          try {
            const { orderNumber, paymentInstructions } = await createOrderCore({
              customer: { firstName, lastName, phone, district },
              items: [{ name: product.name, quantity, price: product.priceRwf, productId: product.id }],
              paymentMethod,
              channel: 'ussd',
            });

            if (paymentMethodChoice === '1') {
              await MomoService.initiatePayment({ phone, amount: totalRwf, reference: orderNumber, description: `KosmoPads USSD order ${orderNumber}` }).catch(() => null);
              res.send(`END Order ${orderNumber} placed!\nApprove the MoMo prompt on your phone to pay ${totalRwf} RWF.`);
            } else {
              res.send(`END Order ${orderNumber} placed!\nPay ${totalRwf} RWF cash on delivery/pickup. Keep this Order Number to track it.`);
            }
          } catch (err: any) {
            res.send(`END Could not place order: ${err.message || 'please try again later.'}`);
          }
          return;
        }
      }

      // ============ SUB-BRANCH: PayGo installments ============
      if (purchaseType === '2') {
        if (step.length === 4) {
          res.send(`CON Choose down payment:\n1. ${DOWN_PAYMENT_OPTIONS[0]}%\n2. ${DOWN_PAYMENT_OPTIONS[1]}%\n3. ${DOWN_PAYMENT_OPTIONS[2]}%`);
          return;
        }
        const downPct = DOWN_PAYMENT_OPTIONS[parseInt(step[4], 10) - 1];
        if (!downPct) { res.send('END Invalid selection. Please dial again.'); return; }

        if (step.length === 5) {
          res.send(`CON Choose repayment term:\n1. ${TERM_OPTIONS[0]} months\n2. ${TERM_OPTIONS[1]} months\n3. ${TERM_OPTIONS[2]} months`);
          return;
        }
        const termMonths = TERM_OPTIONS[parseInt(step[5], 10) - 1];
        if (!termMonths) { res.send('END Invalid selection. Please dial again.'); return; }

        if (step.length === 6) { res.send('CON Enter your full name\n(First Last):'); return; }
        const fullName = step[6]?.trim();

        if (step.length === 7) { res.send('CON Enter your 16-digit National ID:'); return; }
        const nationalId = step[7]?.trim();
        if (!/^\d{16}$/.test(nationalId || '')) {
          res.send('END Invalid National ID — must be exactly 16 digits. Please dial again.');
          return;
        }

        if (step.length === 8) { res.send('CON Enter your District:'); return; }
        const district = step[8]?.trim();
        if (step.length === 9) { res.send('CON Enter your Sector:'); return; }
        const sector = step[9]?.trim();
        if (step.length === 10) { res.send('CON Enter your Cell:'); return; }
        const cell = step[10]?.trim();
        if (step.length === 11) { res.send('CON Enter your Village:'); return; }
        const village = step[11]?.trim();

        if (step.length === 12) {
          res.send('CON Pay down payment via:\n1. MTN MoMo now\n2. Cash to agent');
          return;
        }
        const downPaymentMethodChoice = step[12];

        if (step.length === 13) {
          const downPaymentRwf = Math.round((totalRwf * downPct) / 100);
          const [firstName, ...rest] = (fullName || 'USSD Customer').split(' ');
          const lastName = rest.join(' ') || '-';

          try {
            const { orderNumber, loan } = await createOrderCore({
              customer: { firstName, lastName, phone, district, sector, cell, village, nationalId },
              items: [{ name: product.name, quantity, price: product.priceRwf, productId: product.id }],
              paymentMethod: 'PayGo Installments',
              // Walking through the down-payment %, term, and payment-method
              // steps above and confirming here IS the customer's explicit
              // acceptance in the USSD flow — there's no separate checkbox
              // screen to show, so accepting this final prompt is it.
              installmentPlan: { downPaymentRwf, termMonths, agreementAccepted: true },
              channel: 'ussd',
              userAgent: 'ussd-gateway',
            });

            if (downPaymentMethodChoice === '1') {
              await MomoService.initiatePayment({ phone, amount: downPaymentRwf, reference: orderNumber, description: `KosmoPads PayGo down payment ${orderNumber}` }).catch(() => null);
              res.send(
                `END PayGo plan started! Loan ${loan?.loanNumber}.\nApprove the MoMo prompt to pay your down payment of ${downPaymentRwf} RWF.\nThen ${termMonths} monthly installments follow.`
              );
            } else {
              res.send(
                `END PayGo plan started! Loan ${loan?.loanNumber}.\nPay your down payment of ${downPaymentRwf} RWF in cash to your agent.\nThen ${termMonths} monthly installments follow.`
              );
            }
          } catch (err: any) {
            res.send(`END Could not start PayGo plan: ${err.message || 'please try again later.'}`);
          }
          return;
        }
      }
    }

    // Fallback — unrecognized path
    res.send('END Invalid selection. Please dial again.');
  } catch (error) {
    console.error('USSD handler error:', error);
    res.set('Content-Type', 'text/plain');
    res.send('END Something went wrong. Please try again shortly.');
  }
});

export default router;
