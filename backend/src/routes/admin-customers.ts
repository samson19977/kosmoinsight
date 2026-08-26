import { Router, Request, Response } from 'express';
import { eq, desc, and, or, ilike, sql, inArray } from 'drizzle-orm';
import { requireAdmin, AuthedRequest } from '../middleware/auth';
import { db } from '../config/database';
import { customers, orders, loans, agents } from '../db/schema';
import { AuditService } from '../services/audit.service';
import { parsePageParams, paginatedResponse, sendCsv } from '../lib/listQuery';
import { decryptField, hashForLookup, maskNationalId } from '../lib/fieldCrypto';
import { CreditScoreService } from '../services/creditScore.service';

const router = Router();
router.use(requireAdmin);

// Builds the shared WHERE clause for the paginated list and the CSV export.
// Search matches first/last name, phone, or email via ILIKE as before.
// National ID is DIFFERENT: it's encrypted at rest, so there's no way to
// substring-match it in SQL anymore — ILIKE against ciphertext would just
// never match anything real. Instead: if the search term is exactly 16
// digits (a complete national ID), match it via an exact-match lookup
// against the deterministic hash column. Partial ID search is no longer
// possible — a reasonable trade-off for not storing IDs in plaintext.
function buildCustomersFilter(search: string) {
  if (!search) return undefined;
  const like = `%${search}%`;
  const clauses = [ilike(customers.firstName, like), ilike(customers.lastName, like), ilike(customers.phone, like), ilike(customers.email, like)];
  if (/^\d{16}$/.test(search)) {
    clauses.push(eq(customers.nationalIdHash, hashForLookup(search)));
  }
  return or(...clauses);
}

function selectCustomerColumns() {
  return {
    id: customers.id,
    firstName: customers.firstName,
    lastName: customers.lastName,
    phone: customers.phone,
    email: customers.email,
    district: customers.district,
    sector: customers.sector,
    cell: customers.cell,
    village: customers.village,
    nationalId: customers.nationalId, // encrypted — never send this raw to a client, see helpers below
    agentId: customers.agentId,
    agentName: agents.name,
    acquisitionChannel: customers.acquisitionChannel,
    source: customers.source,
    createdAt: customers.createdAt,
  };
}

// For list/CSV views: show only the last 4 digits. Browsing a list of many
// customers doesn't need the full national ID visible for each row — that's
// unnecessary exposure of a real government ID number. Full ID is only ever
// decrypted for a single specific customer, in the detail view below.
function maskRowNationalId<T extends { nationalId: string | null }>(row: T): T {
  if (!row.nationalId) return row;
  try {
    return { ...row, nationalId: maskNationalId(decryptField(row.nationalId)) };
  } catch (err) {
    console.error(`Failed to decrypt nationalId for masking (customer row):`, err);
    return { ...row, nationalId: '—' };
  }
}

// ============================================
// GET /api/admin/customers — paginated, searchable (name/phone/email/
// national ID) list of every customer. This is the admin-wide view; an
// agent only ever sees their own customers via /api/agents/customers.
// ============================================
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parsePageParams(req.query);
    const where = buildCustomersFilter(params.search);

    const [rows, [{ count }]] = await Promise.all([
      db
        .select(selectCustomerColumns())
        .from(customers)
        .leftJoin(agents, eq(customers.agentId, agents.id))
        .where(where)
        .orderBy(desc(customers.createdAt))
        .limit(params.pageSize)
        .offset(params.offset),
      db.select({ count: sql<number>`count(*)::int` }).from(customers).where(where),
    ]);

    res.json(paginatedResponse(rows.map(maskRowNationalId), count, params));
  } catch (error) {
    console.error('List customers error:', error);
    res.status(500).json({ error: 'Failed to load customers' });
  }
});

// GET /api/admin/customers/export/csv — same search filter, all matching
// rows. National ID is masked here too — a CSV file is easy to copy,
// email, or leave on a shared drive, so bulk-exporting full government ID
// numbers is its own exposure risk even when the underlying storage is encrypted.
router.get('/export/csv', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parsePageParams(req.query);
    const where = buildCustomersFilter(params.search);
    const rows = await db
      .select(selectCustomerColumns())
      .from(customers)
      .leftJoin(agents, eq(customers.agentId, agents.id))
      .where(where)
      .orderBy(desc(customers.createdAt));
    sendCsv(
      res,
      `customers-${new Date().toISOString().slice(0, 10)}.csv`,
      ['firstName', 'lastName', 'phone', 'email', 'district', 'sector', 'cell', 'village', 'nationalId', 'agentName', 'source', 'createdAt'],
      rows.map(maskRowNationalId).map((c) => ({ ...c, createdAt: c.createdAt?.toISOString() }))
    );
  } catch (error) {
    console.error('Export customers CSV error:', error);
    res.status(500).json({ error: 'Failed to export customers' });
  }
});

// ============================================
// GET /api/admin/customers/duplicate-national-ids — flags any national ID
// that appears on MORE THAN ONE customer record. This is a fraud-review
// tool, not an automatic block: a duplicate could be an innocent data-entry
// mistake (an agent re-registered someone who forgot they already had an
// account) OR it could be someone deliberately creating a second profile
// to get around the one-active-loan-at-a-time rule — LoanService now
// blocks that specific attempt automatically (see the identity check in
// createLoan), but this view lets an admin proactively spot and resolve
// duplicates before anyone even tries.
// ============================================
router.get('/duplicate-national-ids', async (_req: Request, res: Response): Promise<void> => {
  try {
    const duplicateHashes = await db
      .select({ nationalIdHash: customers.nationalIdHash, count: sql<number>`count(*)::int` })
      .from(customers)
      .where(sql`${customers.nationalIdHash} IS NOT NULL`)
      .groupBy(customers.nationalIdHash)
      .having(sql`count(*) > 1`);

    if (duplicateHashes.length === 0) {
      res.json({ success: true, groups: [] });
      return;
    }

    const hashes = duplicateHashes.map((d) => d.nationalIdHash!);
    const rows = await db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        nationalId: customers.nationalId,
        nationalIdHash: customers.nationalIdHash,
        agentName: agents.name,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .leftJoin(agents, eq(customers.agentId, agents.id))
      .where(inArray(customers.nationalIdHash, hashes));

    // For each duplicated hash, check whether any of the customer records
    // sharing it currently has an active/defaulted loan — that's the
    // urgent case (a real attempt to bypass the sequencing rule, or
    // already in progress), versus a duplicate with no loans yet
    // (lower priority — worth merging/cleaning up, but not actively risky).
    const groups = await Promise.all(
      duplicateHashes.map(async (d) => {
        const customersInGroup = rows.filter((r) => r.nationalIdHash === d.nationalIdHash);
        const customerIds = customersInGroup.map((c) => c.id);
        const loanRows = await db
          .select({ id: loans.id, loanNumber: loans.loanNumber, status: loans.status, customerId: loans.customerId })
          .from(loans)
          .where(inArray(loans.customerId, customerIds));
        const hasActiveLoan = loanRows.some((l) => l.status === 'active' || l.status === 'defaulted');

        return {
          maskedNationalId: customersInGroup[0]?.nationalId ? maskNationalId(decryptField(customersInGroup[0].nationalId)) : null,
          customers: customersInGroup.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, agentName: c.agentName, createdAt: c.createdAt })),
          loans: loanRows,
          hasActiveLoan,
        };
      })
    );

    // Most urgent (has an active/defaulted loan under a duplicate) first
    groups.sort((a, b) => Number(b.hasActiveLoan) - Number(a.hasActiveLoan));

    res.json({ success: true, groups });
  } catch (error) {
    console.error('Duplicate national IDs error:', error);
    res.status(500).json({ error: 'Failed to check for duplicate national IDs' });
  }
});

// ============================================
// GET /api/admin/customers/:id/credit-profile — this customer's PayGo
// repayment history, tier, and suggested terms for their NEXT loan (if
// any). Read-only suggestion for the admin creating a new loan — never
// applied automatically. See src/services/creditScore.service.ts for the
// full reasoning behind why this stays a human decision.
// ============================================
router.get('/:id/credit-profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id));
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    const profile = await CreditScoreService.getProfile(id);
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Credit profile error:', error);
    res.status(500).json({ error: 'Failed to compute credit profile' });
  }
});

// GET /api/admin/customers/:id — full detail for one customer. This is the
// ONE place the full, unmasked national ID is ever decrypted and returned
// — there's a legitimate specific need here (e.g. verifying identity
// against a PayGo application for this one customer), unlike the list/CSV
// views above which don't need it per-row.
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [customer] = await db.select(selectCustomerColumns()).from(customers).leftJoin(agents, eq(customers.agentId, agents.id)).where(eq(customers.id, id));
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    let decryptedNationalId: string | null = null;
    if (customer.nationalId) {
      try {
        decryptedNationalId = decryptField(customer.nationalId);
      } catch (err) {
        console.error(`Failed to decrypt nationalId for customer ${id}:`, err);
      }
    }

    const customerOrders = await db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.createdAt));
    const customerLoans = await db.select().from(loans).where(eq(loans.customerId, id)).orderBy(desc(loans.createdAt));
    res.json({ success: true, customer: { ...customer, nationalId: decryptedNationalId }, orders: customerOrders, loans: customerLoans });
  } catch (error) {
    console.error('Customer detail error:', error);
    res.status(500).json({ error: 'Failed to load customer' });
  }
});

// ============================================
// DELETE /api/admin/customers/:id — admin-only (requireAdmin above; no
// agent-facing route ever exposes this). Refuses to delete any customer
// who has order or loan history, since that would break financial/audit
// records — the customer would need to stay on file even if inactive.
// ============================================
router.delete('/:id', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const [orderRow] = await db.select({ count: sql<number>`count(*)::int` }).from(orders).where(eq(orders.customerId, id));
    const [loanRow] = await db.select({ count: sql<number>`count(*)::int` }).from(loans).where(eq(loans.customerId, id));

    if (orderRow.count > 0 || loanRow.count > 0) {
      res.status(409).json({
        error: `This customer has ${orderRow.count} order(s) and ${loanRow.count} loan(s) on record and can't be deleted — that would break financial/audit history. Consider leaving them on file even if inactive.`,
      });
      return;
    }

    await db.delete(customers).where(eq(customers.id, id));
    await AuditService.log({
      adminId: req.admin?.id ?? null,
      action: 'customer_deleted',
      targetType: 'customer',
      targetId: id,
      details: { name: `${customer.firstName} ${customer.lastName}`, phone: customer.phone },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});


export default router;

