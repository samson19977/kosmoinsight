import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { validate } from '../middleware/validate';
import { agentRegisterSchema, agentLoginSchema, agentCustomerSchema, agentOrderSchema } from '../lib/validation/schemas';
import { signAgentToken, requireAgent, AgentAuthedRequest } from '../middleware/auth';
import { AgentService } from '../services/agent.service';
import { LoanService } from '../services/loan.service';
import { db } from '../config/database';
import { customers, installments, loans, agents } from '../db/schema';
import { createOrderCore } from './orders';

const router = Router();

function sanitizeAgent(agent: any) {
  const { passwordHash, ...safe } = agent;
  return safe;
}

// ============================================
// POST /api/agents/register — PUBLIC. Starts life as 'pending'; cannot
// log in successfully (requireAgent rejects it) until an admin approves.
// ============================================
router.post('/register', validate(agentRegisterSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const agent = await AgentService.registerAgent(req.body);
    res.status(201).json({
      success: true,
      message: `Application received! Your agent code is ${agent.code}. Kosmotive will review your application before you can log in and start selling.`,
      agentCode: agent.code,
    });
  } catch (error: any) {
    console.error('Agent registration error:', error);
    res.status(409).json({ error: error.message || 'Failed to register' });
  }
});

// ============================================
// POST /api/agents/login — PUBLIC. Login by phone or email + password.
// ============================================
router.post('/login', validate(agentLoginSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, password } = req.body;
    const agent = await AgentService.verifyLogin(identifier, password);

    if (!agent) {
      res.status(401).json({ error: 'Incorrect phone/email or password.' });
      return;
    }
    if (agent.status !== 'active' && agent.status !== 'approved') {
      res.status(403).json({ error: `Your account is currently "${agent.status}". ${agent.status === 'pending' ? 'Please wait for Kosmotive to review your application.' : 'Contact Kosmotive support.'}` });
      return;
    }

    await AgentService.recordLogin(agent.id);
    const token = signAgentToken({ id: agent.id, code: agent.code });
    res.json({ success: true, token, agent: sanitizeAgent(agent) });
  } catch (error) {
    console.error('Agent login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ---- Everything below requires a valid, approved/active agent session ----
router.use(requireAgent);

// GET /api/agents/me
router.get('/me', async (req: AgentAuthedRequest, res: Response): Promise<void> => {
  const [agent] = await db.select().from(agents).where(eq(agents.id, req.agent!.id));
  res.json({ success: true, agent: agent ? sanitizeAgent(agent) : req.agent });
});

// GET /api/agents/dashboard
router.get('/dashboard', async (req: AgentAuthedRequest, res: Response): Promise<void> => {
  try {
    const dashboard = await AgentService.getMyDashboard(req.agent!.id);
    res.json({ success: true, ...dashboard });
  } catch (error) {
    console.error('Agent dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// GET /api/agents/referral — this agent's referral link + code
router.get('/referral', async (req: AgentAuthedRequest, res: Response): Promise<void> => {
  const base = process.env.STOREFRONT_URL || 'https://kosmopads.rw';
  res.json({
    success: true,
    agentCode: req.agent!.code,
    referralUrl: `${base}/?ref=${req.agent!.code}`,
  });
});

// GET /api/agents/customers — only this agent's own customers
router.get('/customers', async (req: AgentAuthedRequest, res: Response): Promise<void> => {
  try {
    const list = await AgentService.getMyCustomers(req.agent!.id);
    res.json({ success: true, customers: list });
  } catch (error) {
    console.error('Agent customers error:', error);
    res.status(500).json({ error: 'Failed to load customers' });
  }
});

// GET /api/agents/customers/:id — ownership-checked detail
router.get('/customers/:id', async (req: AgentAuthedRequest, res: Response): Promise<void> => {
  try {
    const detail = await AgentService.getMyCustomerDetail(req.agent!.id, Number(req.params.id));
    if (!detail) {
      res.status(404).json({ error: 'Customer not found' }); // never reveals whether it belongs to another agent
      return;
    }
    res.json({ success: true, ...detail });
  } catch (error) {
    console.error('Agent customer detail error:', error);
    res.status(500).json({ error: 'Failed to load customer' });
  }
});

// POST /api/agents/customers — register a new customer under this agent.
// If a customer with this phone already exists and is unclaimed (or
// already this agent's), it's reused rather than duplicated.
router.post('/customers', validate(agentCustomerSchema), async (req: AgentAuthedRequest, res: Response): Promise<void> => {
  try {
    const input = req.body;
    const [existing] = await db.select().from(customers).where(eq(customers.phone, input.phone));

    if (existing) {
      if (existing.agentId && existing.agentId !== req.agent!.id) {
        res.status(409).json({ error: 'A customer with this phone number already belongs to a different agent.' });
        return;
      }
      const [updated] = await db
        .update(customers)
        .set({
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email || existing.email,
          district: input.district || existing.district,
          sector: input.sector || existing.sector,
          cell: input.cell || existing.cell,
          village: input.village || existing.village,
          nationalId: input.nationalId || existing.nationalId,
          agentId: req.agent!.id,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, existing.id))
        .returning();
      res.json({ success: true, customer: updated, reused: true });
      return;
    }

    const [created] = await db
      .insert(customers)
      .values({
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email || null,
        district: input.district || null,
        sector: input.sector || null,
        cell: input.cell || null,
        village: input.village || null,
        nationalId: input.nationalId || null,
        agentId: req.agent!.id,
        source: 'agent',
      })
      .returning();
    res.status(201).json({ success: true, customer: created, reused: false });
  } catch (error) {
    console.error('Agent create customer error:', error);
    res.status(500).json({ error: 'Failed to register customer' });
  }
});

// GET /api/agents/orders — only this agent's own orders
router.get('/orders', async (req: AgentAuthedRequest, res: Response): Promise<void> => {
  try {
    const list = await AgentService.getMyOrders(req.agent!.id);
    res.json({ success: true, orders: list });
  } catch (error) {
    console.error('Agent orders error:', error);
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

// ============================================
// POST /api/agents/orders — an agent recording a sale on a customer's
// behalf. Reuses the EXACT SAME createOrderCore() the website checkout
// and USSD gateway use — same PayGo eligibility rules, same loan
// creation, same inventory/commission hooks — with agentId always taken
// from the authenticated session (agentIdOverride), never from the
// request body. Term/interest are still bounded by the same
// orderInstallmentPlanSchema validation everyone else goes through; an
// agent cannot request arbitrary financing terms.
// ============================================
router.post('/orders', validate(agentOrderSchema), async (req: AgentAuthedRequest, res: Response): Promise<void> => {
  try {
    const { customerId, customer, items, paymentMethod, installmentPlan, notes } = req.body;

    const { order, orderNumber, totalRwf, loan } = await createOrderCore({
      customerId,
      customer,
      items,
      paymentMethod,
      installmentPlan,
      agentIdOverride: req.agent!.id,
      channel: 'agent',
      notes,
    });

    res.status(201).json({
      success: true,
      orderNumber,
      orderId: order.id,
      total: totalRwf,
      loan: loan
        ? { loanNumber: loan.loanNumber, principalRwf: loan.principalRwf, downPaymentRwf: loan.downPaymentRwf, totalPayableRwf: loan.totalPayableRwf, termMonths: loan.termMonths }
        : null,
    });
  } catch (error: any) {
    console.error('Agent create order error:', error);
    const isClientError = /minimum order|installment|eligible|down payment|customer|belongs to a different/i.test(error.message || '');
    res.status(isClientError ? 400 : 500).json({ error: error.message || 'Failed to create order' });
  }
});

// GET /api/agents/commissions
router.get('/commissions', async (req: AgentAuthedRequest, res: Response): Promise<void> => {
  try {
    const list = await AgentService.getMyCommissions(req.agent!.id);
    res.json({ success: true, commissions: list });
  } catch (error) {
    console.error('Agent commissions error:', error);
    res.status(500).json({ error: 'Failed to load commissions' });
  }
});

// GET /api/agents/payouts
router.get('/payouts', async (req: AgentAuthedRequest, res: Response): Promise<void> => {
  try {
    const list = await AgentService.getMyPayouts(req.agent!.id);
    res.json({ success: true, payouts: list });
  } catch (error) {
    console.error('Agent payouts error:', error);
    res.status(500).json({ error: 'Failed to load payouts' });
  }
});

// ============================================
// POST /api/agents/loans/:loanNumber/installments/:installmentId/pay
// Agent-assisted installment collection (cash/bank collected in person) —
// reuses LoanService.recordPayment, the exact same logic the admin
// dashboard uses. Ownership is verified before anything is applied: the
// loan's customer must belong to THIS agent.
// ============================================
router.post('/loans/:loanNumber/installments/:installmentId/pay', async (req: AgentAuthedRequest, res: Response): Promise<void> => {
  try {
    const { loanNumber, installmentId } = req.params;
    const { amountRwf, method, note } = req.body;

    if (!Number.isFinite(amountRwf) || amountRwf <= 0) {
      res.status(400).json({ error: 'amountRwf must be a positive number' });
      return;
    }
    if (!['cash', 'momo', 'bank'].includes(method)) {
      res.status(400).json({ error: 'method must be one of cash, momo, bank' });
      return;
    }

    const [loan] = await db.select().from(loans).where(eq(loans.loanNumber, loanNumber));
    if (!loan) { res.status(404).json({ error: 'Loan not found' }); return; }

    const [customer] = await db.select().from(customers).where(eq(customers.id, loan.customerId));
    if (!customer || customer.agentId !== req.agent!.id) {
      res.status(403).json({ error: 'This loan does not belong to one of your customers' }); // ownership check
      return;
    }

    const [installment] = await db.select().from(installments).where(eq(installments.id, Number(installmentId)));
    if (!installment || installment.loanId !== loan.id) {
      res.status(404).json({ error: 'Installment not found on this loan' });
      return;
    }

    const result = await LoanService.recordPayment(installment.id, { amountRwf, method, note: note || `Collected by agent ${req.agent!.code}` });
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Agent installment payment error:', error);
    res.status(400).json({ error: error.message || 'Failed to record payment' });
  }
});

export default router;
