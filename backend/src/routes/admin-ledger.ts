import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middleware/auth';
import { db } from '../config/database';
import { agents } from '../db/schema';
import { LedgerService } from '../services/ledger.service';
import { parsePageParams, sendCsv } from '../lib/listQuery';

const router = Router();
router.use(requireAdmin);

// ============================================
// GET /api/admin/ledger — paginated, filterable view of every ledger
// entry (accountType, accountId, category, date range). This is a
// READ-ONLY window onto the ledger — entries are only ever written by
// the services that cause them (PaymentReconciliationService,
// AgentService, LoanService), never directly through this route, since
// the ledger is meant to be an immutable, trustworthy record.
// ============================================
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parsePageParams(req.query);
    const { accountType, accountId, category, fromDate, toDate } = req.query;

    const result = await LedgerService.list({
      page: params.page,
      pageSize: params.pageSize,
      accountType: accountType ? String(accountType) : undefined,
      accountId: accountId ? Number(accountId) : undefined,
      category: category ? String(category) : undefined,
      fromDate: fromDate ? String(fromDate) : undefined,
      toDate: toDate ? String(toDate) : undefined,
    });

    // Attach agent names for readability, since ledger rows only store accountId
    const agentIds = [...new Set(result.rows.filter((r) => r.accountType === 'agent' && r.accountId).map((r) => r.accountId!))];
    const agentNames: Record<number, string> = {};
    if (agentIds.length > 0) {
      const agentRows = await db.select({ id: agents.id, name: agents.name, code: agents.code }).from(agents);
      for (const a of agentRows) if (agentIds.includes(a.id)) agentNames[a.id] = `${a.name} (${a.code})`;
    }

    res.json({
      success: true,
      data: result.rows.map((r) => ({ ...r, accountLabel: r.accountType === 'business' ? 'Kosmotive' : agentNames[r.accountId!] || `Agent #${r.accountId}` })),
      pagination: { page: params.page, pageSize: params.pageSize, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / params.pageSize)) },
      netRwf: result.netRwf,
    });
  } catch (error) {
    console.error('List ledger error:', error);
    res.status(500).json({ error: 'Failed to load ledger' });
  }
});

// GET /api/admin/ledger/balances — current balance for Kosmotive's own
// account plus every agent with any ledger activity. Balance is always
// derived live (SUM of entries), never stored, so it can't drift.
router.get('/balances', async (_req: Request, res: Response): Promise<void> => {
  try {
    const businessBalance = await LedgerService.getBalance('business');
    const agentRows = await db.select({ id: agents.id, name: agents.name, code: agents.code }).from(agents);
    const agentBalances = await Promise.all(
      agentRows.map(async (a) => ({ agentId: a.id, name: a.name, code: a.code, balanceRwf: await LedgerService.getBalance('agent', a.id) }))
    );
    res.json({
      success: true,
      business: { balanceRwf: businessBalance },
      agents: agentBalances.filter((a) => a.balanceRwf !== 0),
    });
  } catch (error) {
    console.error('Ledger balances error:', error);
    res.status(500).json({ error: 'Failed to load ledger balances' });
  }
});

// GET /api/admin/ledger/export/csv — same filters as the list, every matching row.
router.get('/export/csv', async (req: Request, res: Response): Promise<void> => {
  try {
    const { accountType, accountId, category, fromDate, toDate } = req.query;
    const result = await LedgerService.list({
      page: 1,
      pageSize: 100000,
      accountType: accountType ? String(accountType) : undefined,
      accountId: accountId ? Number(accountId) : undefined,
      category: category ? String(category) : undefined,
      fromDate: fromDate ? String(fromDate) : undefined,
      toDate: toDate ? String(toDate) : undefined,
    });
    sendCsv(
      res,
      `ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      ['id', 'accountType', 'accountId', 'amountRwf', 'category', 'referenceType', 'referenceId', 'description', 'createdAt'],
      result.rows.map((r) => ({ ...r, createdAt: r.createdAt?.toISOString() }))
    );
  } catch (error) {
    console.error('Export ledger CSV error:', error);
    res.status(500).json({ error: 'Failed to export ledger' });
  }
});

export default router;
