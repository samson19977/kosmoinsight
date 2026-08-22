import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { db, DbClient } from '../config/database';
import { ledgerEntries } from '../db/schema';

export interface LedgerEntryInput {
  accountType: 'business' | 'agent';
  accountId?: number | null;
  amountRwf: number; // signed
  category: string;
  referenceType?: string;
  referenceId?: number;
  description: string;
  createdByAdminId?: number | null;
}

export class LedgerService {
  // The ONLY function that writes to ledger_entries. Always called with a
  // `client` (the caller's transaction handle) when it's recording the
  // financial side of some other operation — e.g.
  // PaymentReconciliationService passes its own `tx` here, so the ledger
  // entry lands in the exact same transaction as the order being marked
  // paid. If either fails, both roll back together: there's no way to end
  // up with an order marked paid but no ledger entry for it, or vice versa.
  static async record(entry: LedgerEntryInput, client: DbClient = db) {
    const [row] = await client
      .insert(ledgerEntries)
      .values({
        accountType: entry.accountType,
        accountId: entry.accountId ?? null,
        amountRwf: entry.amountRwf,
        category: entry.category,
        referenceType: entry.referenceType ?? null,
        referenceId: entry.referenceId ?? null,
        description: entry.description,
        createdByAdminId: entry.createdByAdminId ?? null,
      })
      .returning();
    return row;
  }

  // Current balance for an account — always derived by summing every
  // entry, never stored redundantly, so it can never drift out of sync.
  static async getBalance(accountType: 'business' | 'agent', accountId: number | null = null) {
    const where = accountType === 'business'
      ? eq(ledgerEntries.accountType, 'business')
      : and(eq(ledgerEntries.accountType, 'agent'), eq(ledgerEntries.accountId, accountId!));

    const [row] = await db
      .select({ balance: sql<number>`COALESCE(SUM(${ledgerEntries.amountRwf}), 0)::int` })
      .from(ledgerEntries)
      .where(where);
    return row?.balance ?? 0;
  }

  // Paginated/searchable/filterable list for the admin Ledger tab.
  static async list(opts: {
    page: number;
    pageSize: number;
    accountType?: string;
    accountId?: number;
    category?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    const clauses = [];
    if (opts.accountType) clauses.push(eq(ledgerEntries.accountType, opts.accountType));
    if (opts.accountId !== undefined) clauses.push(eq(ledgerEntries.accountId, opts.accountId));
    if (opts.category) clauses.push(eq(ledgerEntries.category, opts.category));
    if (opts.fromDate) clauses.push(gte(ledgerEntries.createdAt, new Date(opts.fromDate)));
    if (opts.toDate) clauses.push(lte(ledgerEntries.createdAt, new Date(opts.toDate)));
    const where = clauses.length ? and(...clauses) : undefined;

    const offset = (opts.page - 1) * opts.pageSize;
    const [rows, [{ count }], [{ netRwf }]] = await Promise.all([
      db.select().from(ledgerEntries).where(where).orderBy(desc(ledgerEntries.createdAt)).limit(opts.pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(ledgerEntries).where(where),
      db.select({ netRwf: sql<number>`COALESCE(SUM(${ledgerEntries.amountRwf}), 0)::int` }).from(ledgerEntries).where(where),
    ]);

    return { rows, total: count, netRwf };
  }
}
