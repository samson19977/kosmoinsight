import { Router, Request, Response } from 'express';
import multer from 'multer';
import { validate } from '../middleware/validate';
import { agentSchema, agentUpdateSchema } from '../lib/validation/schemas';
import { requireAdmin, AuthedRequest } from '../middleware/auth';
import { AgentService } from '../services/agent.service';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — plenty for a reseller list
});

router.use(requireAdmin);

// ============================================
// GET /api/admin/agents — list every agent with live commission totals
// ============================================
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const list = await AgentService.listAgents();
    const defaultCommissionBps = await AgentService.getDefaultCommissionBps();
    res.json({ success: true, agents: list, defaultCommissionBps });
  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({ error: 'Failed to list agents' });
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

router.patch('/settings/default-commission', async (req: Request, res: Response): Promise<void> => {
  const { commissionRateBps } = req.body;
  if (!Number.isInteger(commissionRateBps) || commissionRateBps < 0 || commissionRateBps > 5000) {
    res.status(400).json({ error: 'commissionRateBps must be an integer between 0 and 5000 (0–50%)' });
    return;
  }
  await AgentService.setDefaultCommissionBps(commissionRateBps);
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
// GET /api/admin/agents/:id — full detail: agent + customers + commission ledger
// ============================================
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const detail = await AgentService.getAgentDetail(id);
    if (!detail) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ success: true, ...detail });
  } catch (error) {
    console.error('Agent detail error:', error);
    res.status(500).json({ error: 'Failed to load agent' });
  }
});

// ============================================
// PATCH /api/admin/agents/:id — update details, commission rate, or status
// ============================================
router.patch('/:id', validate(agentUpdateSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const updated = await AgentService.updateAgent(id, req.body);
    res.json({ success: true, agent: updated });
  } catch (error: any) {
    console.error('Update agent error:', error);
    res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message || 'Failed to update agent' });
  }
});

// ============================================
// POST /api/admin/agents/:id/pay-commission — mark pending commission(s)
// as paid out. Body: { commissionIds?: number[] } — omit to pay everything
// currently pending for this agent.
// ============================================
router.post('/:id/pay-commission', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { commissionIds } = req.body || {};
    const result = await AgentService.markCommissionsPaid(id, commissionIds);
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
    const agent = await AgentService.approveAgent(Number(req.params.id), req.admin!.id);
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
    const agent = await AgentService.rejectAgent(Number(req.params.id), req.admin!.id, req.body?.reason);
    res.json({ success: true, agent });
  } catch (error: any) {
    res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message || 'Failed to reject agent' });
  }
});

// ============================================
// POST /api/admin/agents/:id/suspend — Body: { reason?: string }
// ============================================
router.post('/:id/suspend', async (req: Request, res: Response): Promise<void> => {
  try {
    const agent = await AgentService.suspendAgent(Number(req.params.id), req.body?.reason);
    res.json({ success: true, agent });
  } catch (error: any) {
    res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message || 'Failed to suspend agent' });
  }
});

// ============================================
// POST /api/admin/agents/:id/reactivate
// ============================================
router.post('/:id/reactivate', async (req: Request, res: Response): Promise<void> => {
  try {
    const agent = await AgentService.reactivateAgent(Number(req.params.id));
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
router.post('/:id/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'newPassword must be at least 8 characters' });
      return;
    }
    await AgentService.resetPassword(Number(req.params.id), newPassword);
    res.json({ success: true, message: 'Password reset. Share the new password with the agent through a secure channel.' });
  } catch (error: any) {
    res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message || 'Failed to reset password' });
  }
});

export default router;
