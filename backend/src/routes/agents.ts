import { Router, Request, Response } from 'express';
import multer from 'multer';
import { validate } from '../middleware/validate';
import { agentSchema, agentUpdateSchema } from '../lib/validation/schemas';
import { requireAdmin, AuthedRequest } from '../middleware/auth';
import { AgentService } from '../services/agent.service';
import { AuditService } from '../services/audit.service';
import { EmailService } from '../services/email.service';
import { db } from '../config/database';
import { agents } from '../db/schema';
import { eq } from 'drizzle-orm';
import { parsePageParams, paginatedResponse, sendCsv } from '../lib/listQuery';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — plenty for a reseller list
});

router.use(requireAdmin);

// Agent count is small and bounded (a reseller roster, not a transaction
// table), so search/pagination stay a simple in-memory filter over
// AgentService.listAgents() rather than a full SQL rewrite — the same
// scope call made for the aggregate queries inside that service method.
function filterAgents(list: any[], query: any) {
  let rows = list;
  const search = typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';
  if (search) {
    rows = rows.filter(
      (a) =>
        a.name?.toLowerCase().includes(search) ||
        a.code?.toLowerCase().includes(search) ||
        a.phone?.toLowerCase().includes(search) ||
        a.email?.toLowerCase().includes(search)
    );
  }
  if (query.status && typeof query.status === 'string') {
    rows = rows.filter((a) => a.status === query.status);
  }
  return rows;
}

// ============================================
// GET /api/admin/agents — paginated, searchable (name/code/phone/email),
// filterable (status) list of agents with live commission totals.
// ============================================
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parsePageParams(req.query);
    const list = await AgentService.listAgents();
    const filtered = filterAgents(list, req.query);
    const page = filtered.slice(params.offset, params.offset + params.pageSize);
    const defaultCommissionBps = await AgentService.getDefaultCommissionBps();
    res.json({ ...paginatedResponse(page, filtered.length, params), defaultCommissionBps });
  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// GET /api/admin/agents/export/csv — same search/status filter, all matching rows.
router.get('/export/csv', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parsePageParams(req.query);
    const list = await AgentService.listAgents();
    const filtered = filterAgents(list, req.query);
    sendCsv(
      res,
      `agents-${new Date().toISOString().slice(0, 10)}.csv`,
      ['code', 'name', 'phone', 'email', 'status', 'saleCount', 'pendingCommissionRwf', 'paidCommissionRwf', 'createdAt'],
      filtered.map((a: any) => ({ ...a, createdAt: a.createdAt?.toISOString?.() || a.createdAt }))
    );
  } catch (error) {
    console.error('Export agents CSV error:', error);
    res.status(500).json({ error: 'Failed to export agents' });
  }
});

// ============================================
// POST /api/admin/agents — create a single agent by hand
// ============================================
router.post('/', validate(agentSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await AgentService.getAgentByCode(req.body.code);
    if (existing) {
      res.status(409).json({ error: `Reseller code "${req.body.code}" is already in use` });
      return;
    }
    const agent = await AgentService.createAgent(req.body, 'admin');
    res.status(201).json({ success: true, agent });
  } catch (error) {
    console.error('Create agent error:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// ============================================
// GET /api/admin/agents/summary — counts by status, for dashboard cards
// ============================================
router.get('/summary', async (_req: Request, res: Response): Promise<void> => {
  try {
    const summary = await AgentService.getPortfolioSummary();
    res.json({ success: true, ...summary });
  } catch (error) {
    console.error('Agent summary error:', error);
    res.status(500).json({ error: 'Failed to load agent summary' });
  }
});


// PATCH /api/admin/agents/settings/default-commission — the adjustable
// platform-wide default (starts at 15%, per Kosmotive's current policy).
// ============================================
router.get('/settings/default-commission', async (_req: Request, res: Response): Promise<void> => {
  const bps = await AgentService.getDefaultCommissionBps();
  res.json({ success: true, commissionRateBps: bps, commissionPercent: bps / 100 });
});

router.patch('/settings/default-commission', async (req: AuthedRequest, res: Response): Promise<void> => {
  const { commissionRateBps } = req.body;
  if (!Number.isInteger(commissionRateBps) || commissionRateBps < 0 || commissionRateBps > 5000) {
    res.status(400).json({ error: 'commissionRateBps must be an integer between 0 and 5000 (0–50%)' });
    return;
  }
  await AgentService.setDefaultCommissionBps(commissionRateBps);
  await AuditService.log({ adminId: req.admin!.id, action: 'agents.set_default_commission', targetType: 'settings', targetId: 0, details: { commissionRateBps } });
  res.json({ success: true, commissionRateBps });
});

// ============================================
// POST /api/admin/agents/import — bulk-upload a spreadsheet (.xlsx/.csv)
// of resellers, matching the columns Kosmotive already keeps (Name, Code,
// Number, Email). Upserts by reseller code, so re-uploading a
// partially-updated file is always safe and never creates duplicates.
// ============================================
router.post('/import', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded — attach a field named "file"' });
      return;
    }
    const result = await AgentService.importFromSpreadsheet(req.file.buffer);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Import agents error:', error);
    res.status(400).json({ error: error.message || 'Failed to import spreadsheet — check the file format' });
  }
});

// ============================================
// GET /api/admin/agents/export — download every agent + live commission
// totals as an .xlsx file.
// ============================================
router.get('/export', async (_req: Request, res: Response): Promise<void> => {
  try {
    const buffer = await AgentService.exportToSpreadsheet();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="kosmotive-agents-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    console.error('Export agents error:', error);
    res.status(500).json({ error: 'Failed to export agents' });
  }
});

// ============================================
// Paginated/searchable sub-lists for one agent's detail view — an agent
// with a large customer/order book needs the same search+pagination as
// every other list in this dashboard, not one giant unbounded dump.
// ============================================
router.get('/:id/customers', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const params = parsePageParams(req.query);
    const { rows, total } = await AgentService.getAgentCustomersPaginated(id, { page: params.page, pageSize: params.pageSize, search: params.search });
    res.json(paginatedResponse(rows, total, params));
  } catch (error) {
    console.error('Agent customers (paginated) error:', error);
    res.status(500).json({ error: 'Failed to load agent customers' });
  }
});

router.get('/:id/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const params = parsePageParams(req.query);
    const { rows, total } = await AgentService.getAgentOrdersPaginated(id, { page: params.page, pageSize: params.pageSize, search: params.search });
    res.json(paginatedResponse(rows, total, params));
  } catch (error) {
    console.error('Agent orders (paginated) error:', error);
    res.status(500).json({ error: 'Failed to load agent orders' });
  }
});

router.get('/:id/loans', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const params = parsePageParams(req.query);
    const { rows, total } = await AgentService.getAgentLoansPaginated(id, { page: params.page, pageSize: params.pageSize, search: params.search });
    res.json(paginatedResponse(rows, total, params));
  } catch (error) {
    console.error('Agent loans (paginated) error:', error);
    res.status(500).json({ error: 'Failed to load agent loans' });
  }
});

router.get('/:id/commissions', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const params = parsePageParams(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { rows, total } = await AgentService.getAgentCommissionsPaginated(id, { page: params.page, pageSize: params.pageSize, status });
    res.json(paginatedResponse(rows, total, params));
  } catch (error) {
    console.error('Agent commissions (paginated) error:', error);
    res.status(500).json({ error: 'Failed to load agent commissions' });
  }
});

// ============================================
// GET /api/admin/agents/:id — lightweight detail: agent + summary counts
// ============================================
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const detail = await AgentService.getAgentDetail(id);
    if (!detail) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    const auditLog = await AuditService.getForTarget('agent', id);
    res.json({ success: true, ...detail, auditLog });
  } catch (error) {
    console.error('Agent detail error:', error);
    res.status(500).json({ error: 'Failed to load agent' });
  }
});

// ============================================
// PATCH /api/admin/agents/:id — update details, commission rate, or status
// ============================================
router.patch('/:id', validate(agentUpdateSchema), async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const updated = await AgentService.updateAgent(id, req.body);
    await AuditService.log({ adminId: req.admin!.id, action: 'agent.update', targetType: 'agent', targetId: id, details: req.body });
    res.json({ success: true, agent: updated });
  } catch (error: any) {
    console.error('Update agent error:', error);
    res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message || 'Failed to update agent' });
  }
});

// ============================================
// POST /api/admin/agents/:id/recalculate-commission — after changing this
// agent's commission rate, recompute their still-PENDING commissions to
// the new rate (paid ones are left alone — see the service method for why).
// Call this right after a PATCH that changes commissionRateBps.
// ============================================
router.post('/:id/recalculate-commission', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const result = await AgentService.recalculatePendingCommissions(id);
    await AuditService.log({ adminId: req.admin!.id, action: 'agent.recalculate_commission', targetType: 'agent', targetId: id, details: result });
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Recalculate commission error:', error);
    res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message || 'Failed to recalculate commission' });
  }
});

// ============================================
// POST /api/admin/agents/:id/pay-commission — mark pending commission(s)
// as paid out. Body: { commissionIds?: number[] } — omit to pay everything
// currently pending for this agent.
// ============================================
router.post('/:id/pay-commission', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { commissionIds } = req.body || {};
    const result = await AgentService.markCommissionsPaid(id, commissionIds);
    await AuditService.log({ adminId: req.admin!.id, action: 'agent.pay_commission', targetType: 'agent', targetId: id, details: { commissionIds, ...result } });

    if (result.totalRwf > 0) {
      const [agent] = await db.select({ name: agents.name, email: agents.email }).from(agents).where(eq(agents.id, id));
      if (agent?.email) {
        await EmailService.sendAgentCommissionPaidNotice({
          agentName: agent.name,
          agentEmail: agent.email,
          totalRwf: result.totalRwf,
          count: result.count,
        }).catch((err) => console.error('Agent payout email error (non-fatal):', err));
      }
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Pay commission error:', error);
    res.status(500).json({ error: 'Failed to mark commissions paid' });
  }
});

// ============================================
// POST /api/admin/agents/:id/approve — pending/rejected -> active
// ============================================
router.post('/:id/approve', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const agent = await AgentService.approveAgent(id, req.admin!.id);
    await AuditService.log({ adminId: req.admin!.id, action: 'agent.approve', targetType: 'agent', targetId: id });
    res.json({ success: true, agent });
  } catch (error: any) {
    res.status(error.message?.includes('not found') ? 404 : 400).json({ error: error.message || 'Failed to approve agent' });
  }
});

// ============================================
// POST /api/admin/agents/:id/reject — Body: { reason?: string }
// ============================================
router.post('/:id/reject', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const agent = await AgentService.rejectAgent(id, req.admin!.id, req.body?.reason);
    await AuditService.log({ adminId: req.admin!.id, action: 'agent.reject', targetType: 'agent', targetId: id, details: { reason: req.body?.reason } });
    res.json({ success: true, agent });
  } catch (error: any) {
    res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message || 'Failed to reject agent' });
  }
});

// ============================================
// POST /api/admin/agents/:id/suspend — Body: { reason?: string }
// ============================================
router.post('/:id/suspend', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const agent = await AgentService.suspendAgent(id, req.body?.reason);
    await AuditService.log({ adminId: req.admin!.id, action: 'agent.suspend', targetType: 'agent', targetId: id, details: { reason: req.body?.reason } });
    res.json({ success: true, agent });
  } catch (error: any) {
    res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message || 'Failed to suspend agent' });
  }
});

// ============================================
// POST /api/admin/agents/:id/reactivate
// ============================================
router.post('/:id/reactivate', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const agent = await AgentService.reactivateAgent(id);
    await AuditService.log({ adminId: req.admin!.id, action: 'agent.reactivate', targetType: 'agent', targetId: id });
    res.json({ success: true, agent });
  } catch (error: any) {
    res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message || 'Failed to reactivate agent' });
  }
});

// ============================================
// POST /api/admin/agents/:id/reset-password — Body: { newPassword: string }
// Admin-triggered reset (e.g. agent locked out) — the agent should be
// told to change it again on next login via their own future profile page.
// ============================================
router.post('/:id/reset-password', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'newPassword must be at least 8 characters' });
      return;
    }
    await AgentService.resetPassword(id, newPassword);
    await AuditService.log({ adminId: req.admin!.id, action: 'agent.reset_password', targetType: 'agent', targetId: id });
    res.json({ success: true, message: 'Password reset. Share the new password with the agent through a secure channel.' });
  } catch (error: any) {
    res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message || 'Failed to reset password' });
  }
});

export default router;
