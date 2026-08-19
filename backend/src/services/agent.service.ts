import { eq, sql, and, or, ilike, desc, gte, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import { db } from '../config/database';
import { agents, agentCommissions, customers, settings, orders, orderItems, loans, installments } from '../db/schema';
import type { AgentInput, AgentUpdateInput, AgentRegisterInput } from '../lib/validation/schemas';

const DEFAULT_COMMISSION_BPS = 1500; // 15% — used only if the `settings` row is somehow missing
const BCRYPT_ROUNDS = 10;

export class AgentService {
  // ==========================================================
  // Agent code generation — KOS001, KOS002, ... for self-registered and
  // admin-created agents that don't already come with a code (imported
  // spreadsheets keep their own existing reseller codes instead).
  // ==========================================================
  static async generateNextCode(): Promise<string> {
    const all = await db.select({ code: agents.code }).from(agents);
    const numbers = all
      .map((a) => a.code.match(/^KOS(\d+)$/i))
      .filter((m): m is RegExpMatchArray => Boolean(m))
      .map((m) => parseInt(m[1], 10));
    const next = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
    return `KOS${String(next).padStart(3, '0')}`;
  }

  // ==========================================================
  // Platform-wide default commission rate, adjustable without a deploy.
  // ==========================================================
  static async getDefaultCommissionBps(): Promise<number> {
    const [row] = await db.select().from(settings).where(eq(settings.key, 'default_agent_commission_bps'));
    return row ? parseInt(row.value, 10) : DEFAULT_COMMISSION_BPS;
  }

  static async setDefaultCommissionBps(bps: number): Promise<void> {
    await db
      .insert(settings)
      .values({ key: 'default_agent_commission_bps', value: String(bps), updatedAt: new Date() })
      .onConflictDoUpdate({ target: settings.key, set: { value: String(bps), updatedAt: new Date() } });
  }

  // ==========================================================
  // PUBLIC SELF-REGISTRATION — status starts 'pending'. An agent cannot
  // sell or log in successfully (requireAgent rejects pending/rejected/
  // suspended) until an admin approves them.
  // ==========================================================
  static async registerAgent(input: AgentRegisterInput) {
    const existingPhone = await db.select().from(agents).where(eq(agents.phone, input.phone));
    if (existingPhone.length > 0) throw new Error('An agent account already exists with this phone number');
    const existingEmail = await db.select().from(agents).where(eq(agents.email, input.email.toLowerCase()));
    if (existingEmail.length > 0) throw new Error('An agent account already exists with this email');

    const code = await this.generateNextCode();
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const defaultBps = await this.getDefaultCommissionBps();

    const [agent] = await db
      .insert(agents)
      .values({
        name: `${input.firstName.trim()} ${input.lastName.trim()}`,
        code,
        phone: input.phone,
        email: input.email.toLowerCase(),
        passwordHash,
        nationalId: input.nationalId,
        district: input.district,
        sector: input.sector,
        cell: input.cell,
        village: input.village,
        commissionRateBps: defaultBps,
        status: 'pending',
        source: 'self',
      })
      .returning();

    return agent;
  }

  // ==========================================================
  // LOGIN — by phone or email + password. Deliberately mirrors the
  // constant-time-ish pattern used for admin login (always runs a bcrypt
  // compare, even against a dummy hash, so a nonexistent account and a
  // wrong password take a similar amount of time).
  // ==========================================================
  static async verifyLogin(identifier: string, password: string) {
    const isEmail = identifier.includes('@');
    const [agent] = isEmail
      ? await db.select().from(agents).where(eq(agents.email, identifier.toLowerCase().trim()))
      : await db.select().from(agents).where(eq(agents.phone, identifier.trim()));

    const dummyHash = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Hh5rgHnkKurAfp8mAWJcOJl5b78dO';
    const isValid = await bcrypt.compare(password, agent?.passwordHash || dummyHash);

    if (!agent || !isValid || !agent.passwordHash) return null;
    return agent;
  }

  static async recordLogin(agentId: number) {
    await db.update(agents).set({ lastLoginAt: new Date() }).where(eq(agents.id, agentId));
  }

  // ==========================================================
  // ADMIN LIFECYCLE ACTIONS
  // ==========================================================
  static async approveAgent(id: number, adminId: number) {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    if (!agent) throw new Error('Agent not found');
    if (agent.status !== 'pending' && agent.status !== 'rejected') {
      throw new Error(`Cannot approve an agent with status "${agent.status}"`);
    }
    const [updated] = await db
      .update(agents)
      .set({ status: 'active', approvedAt: new Date(), approvedByAdminId: adminId, updatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning();
    return updated;
  }

  static async rejectAgent(id: number, adminId: number, reason?: string) {
    const [updated] = await db
      .update(agents)
      .set({ status: 'rejected', notes: reason || undefined, approvedByAdminId: adminId, updatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning();
    if (!updated) throw new Error('Agent not found');
    return updated;
  }

  static async suspendAgent(id: number, reason?: string) {
    const [updated] = await db
      .update(agents)
      .set({ status: 'suspended', notes: reason || undefined, updatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning();
    if (!updated) throw new Error('Agent not found');
    return updated;
  }

  static async reactivateAgent(id: number) {
    const [updated] = await db
      .update(agents)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning();
    if (!updated) throw new Error('Agent not found');
    return updated;
  }

  static async resetPassword(id: number, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const [updated] = await db
      .update(agents)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning();
    if (!updated) throw new Error('Agent not found');
    return updated;
  }

  // ==========================================================
  // CRUD (admin-created / spreadsheet-imported agents)
  // ==========================================================
  static async createAgent(input: AgentInput, source: 'admin' | 'import' = 'admin') {
    const commissionRateBps = input.commissionRateBps ?? (await this.getDefaultCommissionBps());
    const [agent] = await db
      .insert(agents)
      .values({
        name: input.name,
        code: input.code.toUpperCase(),
        phone: input.phone,
        email: input.email || null,
        region: input.region || null,
        district: input.district || null,
        commissionRateBps,
        status: 'active',
        notes: input.notes || null,
        source,
      })
      .returning();
    return agent;
  }

  static async updateAgent(id: number, input: AgentUpdateInput) {
    const [existing] = await db.select().from(agents).where(eq(agents.id, id));
    if (!existing) throw new Error(`Agent ${id} not found`);

    const [updated] = await db
      .update(agents)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.code !== undefined && { code: input.code.toUpperCase() }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email || null }),
        ...(input.region !== undefined && { region: input.region || null }),
        ...(input.district !== undefined && { district: input.district || null }),
        // Commission rate can ONLY be changed here, by an admin — never by
        // the agent themselves (there is no agent-facing route that
        // accepts this field at all).
        ...(input.commissionRateBps !== undefined && { commissionRateBps: input.commissionRateBps }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.notes !== undefined && { notes: input.notes || null }),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, id))
      .returning();
    return updated;
  }

  static async listAgents() {
    const all = await db.select().from(agents).orderBy(desc(agents.createdAt));
    const pendingByAgent = await db
      .select({
        agentId: agentCommissions.agentId,
        pendingRwf: sql<number>`COALESCE(SUM(${agentCommissions.commissionRwf}) FILTER (WHERE ${agentCommissions.status} = 'pending'), 0)`,
        paidRwf: sql<number>`COALESCE(SUM(${agentCommissions.commissionRwf}) FILTER (WHERE ${agentCommissions.status} = 'paid'), 0)`,
        saleCount: sql<number>`COUNT(*)`,
      })
      .from(agentCommissions)
      .groupBy(agentCommissions.agentId);

    const customerCounts = await db
      .select({ agentId: customers.agentId, count: sql<number>`COUNT(*)` })
      .from(customers)
      .where(sql`${customers.agentId} IS NOT NULL`)
      .groupBy(customers.agentId);

    const orderCounts = await db
      .select({ agentId: orders.agentId, count: sql<number>`COUNT(*)` })
      .from(orders)
      .where(sql`${orders.agentId} IS NOT NULL`)
      .groupBy(orders.agentId);

    const loanCounts = await db
      .select({ agentId: customers.agentId, count: sql<number>`COUNT(*)` })
      .from(loans)
      .innerJoin(customers, eq(loans.customerId, customers.id))
      .where(and(sql`${customers.agentId} IS NOT NULL`, eq(loans.status, 'active')))
      .groupBy(customers.agentId);

    return all.map((a) => {
      const commission = pendingByAgent.find((p) => p.agentId === a.id);
      const custCount = customerCounts.find((c) => c.agentId === a.id);
      const orderCount = orderCounts.find((o) => o.agentId === a.id);
      const activeLoanCount = loanCounts.find((l) => l.agentId === a.id);
      const { passwordHash, ...safe } = a;
      return {
        ...safe,
        pendingCommissionRwf: Number(commission?.pendingRwf ?? 0),
        paidCommissionRwf: Number(commission?.paidRwf ?? 0),
        saleCount: Number(commission?.saleCount ?? 0),
        customerCount: Number(custCount?.count ?? 0),
        orderCount: Number(orderCount?.count ?? 0),
        activePayGoLoans: Number(activeLoanCount?.count ?? 0),
      };
    });
  }

  static async getPortfolioSummary() {
    const all = await db.select().from(agents);
    const commissionTotals = await db
      .select({
        pendingRwf: sql<number>`COALESCE(SUM(${agentCommissions.commissionRwf}) FILTER (WHERE ${agentCommissions.status} = 'pending'), 0)`,
        paidRwf: sql<number>`COALESCE(SUM(${agentCommissions.commissionRwf}) FILTER (WHERE ${agentCommissions.status} = 'paid'), 0)`,
      })
      .from(agentCommissions);
    return {
      total: all.length,
      pending: all.filter((a) => a.status === 'pending').length,
      active: all.filter((a) => a.status === 'active' || a.status === 'approved').length,
      suspended: all.filter((a) => a.status === 'suspended').length,
      rejected: all.filter((a) => a.status === 'rejected').length,
      pendingCommissionRwf: Number(commissionTotals[0]?.pendingRwf ?? 0),
      paidCommissionRwf: Number(commissionTotals[0]?.paidRwf ?? 0),
    };
  }

  static async getAgentDetail(id: number) {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    if (!agent) return null;
    const { passwordHash, ...safeAgent } = agent;

    const commissions = await db
      .select()
      .from(agentCommissions)
      .where(eq(agentCommissions.agentId, id))
      .orderBy(desc(agentCommissions.createdAt));

    const agentCustomers = await db.select().from(customers).where(eq(customers.agentId, id));
    const agentOrders = await db.select().from(orders).where(eq(orders.agentId, id)).orderBy(desc(orders.createdAt));

    const agentLoans = await db
      .select({ loan: loans })
      .from(loans)
      .innerJoin(customers, eq(loans.customerId, customers.id))
      .where(eq(customers.agentId, id));

    const pendingRwf = commissions.filter((c) => c.status === 'pending').reduce((s, c) => s + c.commissionRwf, 0);
    const paidRwf = commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.commissionRwf, 0);
    const totalSalesRwf = commissions.reduce((s, c) => s + c.saleAmountRwf, 0);

    return {
      agent: safeAgent,
      commissions,
      customers: agentCustomers,
      orders: agentOrders,
      loans: agentLoans.map((l) => l.loan),
      pendingRwf,
      paidRwf,
      totalSalesRwf,
    };
  }

  static async getAgentByCode(code: string) {
    const [agent] = await db.select().from(agents).where(eq(agents.code, code.toUpperCase()));
    return agent || null;
  }

  // ==========================================================
  // AGENT SELF-SERVICE — every method below is scoped to a single
  // agentId, enforced by the caller (routes/agents-self.ts) always
  // passing req.agent.id from the verified JWT — never a client-supplied
  // value. This is what makes "agent cannot see another agent's data" a
  // guarantee rather than a UI convention.
  // ==========================================================
  static async getMyDashboard(agentId: number) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const myOrders = await db.select().from(orders).where(and(eq(orders.agentId, agentId), eq(orders.paymentStatus, 'paid')));

    const sumSince = (since: Date) => myOrders.filter((o) => new Date(o.createdAt!) >= since).reduce((s, o) => s + o.totalRwf, 0);

    const [commissionTotals] = await db
      .select({
        pendingRwf: sql<number>`COALESCE(SUM(${agentCommissions.commissionRwf}) FILTER (WHERE ${agentCommissions.status} = 'pending'), 0)`,
        paidRwf: sql<number>`COALESCE(SUM(${agentCommissions.commissionRwf}) FILTER (WHERE ${agentCommissions.status} = 'paid'), 0)`,
      })
      .from(agentCommissions)
      .where(eq(agentCommissions.agentId, agentId));

    const [customerCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(customers).where(eq(customers.agentId, agentId));

    const myLoans = await db
      .select({ loan: loans })
      .from(loans)
      .innerJoin(customers, eq(loans.customerId, customers.id))
      .where(eq(customers.agentId, agentId));

    const activeLoans = myLoans.filter((l) => l.loan.status === 'active');
    let outstandingRwf = 0;
    if (activeLoans.length > 0) {
      const activeLoanIds = activeLoans.map((l) => l.loan.id);
      const openInstallments = await db
        .select()
        .from(installments)
        .where(inArray(installments.loanId, activeLoanIds));
      outstandingRwf = openInstallments.reduce((s, i) => s + Math.max(0, i.amountDueRwf - (i.amountPaidRwf ?? 0)), 0);
    }

    return {
      salesToday: sumSince(startOfToday),
      salesLast7Days: sumSince(sevenDaysAgo),
      salesLast30Days: sumSince(thirtyDaysAgo),
      salesTotal: myOrders.reduce((s, o) => s + o.totalRwf, 0),
      customerCount: Number(customerCount?.count ?? 0),
      orderCount: myOrders.length,
      pendingCommissionRwf: Number(commissionTotals?.pendingRwf ?? 0),
      paidCommissionRwf: Number(commissionTotals?.paidRwf ?? 0),
      activePayGoLoans: activeLoans.length,
      payGoOutstandingRwf: outstandingRwf,
    };
  }

  // SQL-level pagination + search (name/phone/email) so this stays fast for
  // an agent with a large book of customers, instead of fetching every row
  // and filtering in JS. Pass no `page`/`pageSize` to get every row back
  // (used by the CSV export, which needs the full matching set, unpaged).
  static async getMyCustomers(agentId: number, opts: { page?: number; pageSize?: number; search?: string } = {}) {
    const search = (opts.search || '').trim();
    const clauses = [eq(customers.agentId, agentId)];
    if (search) {
      const like = `%${search}%`;
      clauses.push(or(ilike(customers.firstName, like), ilike(customers.lastName, like), ilike(customers.phone, like), ilike(customers.email, like))!);
    }
    const where = and(...clauses);

    let query = db.select().from(customers).where(where).orderBy(desc(customers.createdAt)).$dynamic();
    if (opts.page && opts.pageSize) {
      query = query.limit(opts.pageSize).offset((opts.page - 1) * opts.pageSize);
    }
    const [rows, [{ count }]] = await Promise.all([
      query,
      db.select({ count: sql<number>`count(*)::int` }).from(customers).where(where),
    ]);
    return { rows, total: count };
  }

  static async getMyCustomerDetail(agentId: number, customerId: number) {
    const [customer] = await db.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.agentId, agentId)));
    if (!customer) return null; // ownership check — an agent gets a 404, not another agent's data

    const customerOrders = await db.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt));
    const customerLoans = await db.select().from(loans).where(eq(loans.customerId, customerId));

    return { customer, orders: customerOrders, loans: customerLoans };
  }

  // Same pagination/search treatment as getMyCustomers — search matches
  // order #, customer name, or phone.
  static async getMyOrders(agentId: number, opts: { page?: number; pageSize?: number; search?: string } = {}) {
    const search = (opts.search || '').trim();
    const clauses = [eq(orders.agentId, agentId)];
    if (search) {
      const like = `%${search}%`;
      clauses.push(or(ilike(orders.orderNumber, like), ilike(orders.customerName, like), ilike(orders.customerPhone, like))!);
    }
    const where = and(...clauses);

    let query = db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).$dynamic();
    if (opts.page && opts.pageSize) {
      query = query.limit(opts.pageSize).offset((opts.page - 1) * opts.pageSize);
    }
    const [rows, [{ count }]] = await Promise.all([
      query,
      db.select({ count: sql<number>`count(*)::int` }).from(orders).where(where),
    ]);
    return { rows, total: count };
  }

  static async getMyCommissions(agentId: number) {
    return db.select().from(agentCommissions).where(eq(agentCommissions.agentId, agentId)).orderBy(desc(agentCommissions.createdAt));
  }

  static async getMyPayouts(agentId: number) {
    return db
      .select()
      .from(agentCommissions)
      .where(and(eq(agentCommissions.agentId, agentId), eq(agentCommissions.status, 'paid')))
      .orderBy(desc(agentCommissions.paidAt));
  }

  // ==========================================================
  // Commission ledger — append-only. Idempotent per order/loan via the
  // unique partial indexes on agent_commissions(order_id)/(loan_id), so
  // it's always safe to call this from every payment-confirmation path
  // (webhook, poll, manual) without double-crediting an agent.
  // ==========================================================
  static async recordCommissionForOrder(orderId: number): Promise<{ recorded: boolean; commissionRwf?: number }> {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order || !order.agentId) return { recorded: false };

    const [existing] = await db.select().from(agentCommissions).where(eq(agentCommissions.orderId, orderId));
    if (existing) return { recorded: false }; // already credited — idempotency guard

    const [agent] = await db.select().from(agents).where(eq(agents.id, order.agentId));
    if (!agent) return { recorded: false };

    const commissionRwf = Math.round((order.totalRwf * agent.commissionRateBps) / 10000);

    try {
      await db.insert(agentCommissions).values({
        agentId: agent.id,
        orderId: order.id,
        saleAmountRwf: order.totalRwf,
        commissionRateBps: agent.commissionRateBps,
        commissionRwf,
        status: 'pending',
        note: `Auto-credited on order ${order.orderNumber} payment confirmation`,
      });
      return { recorded: true, commissionRwf };
    } catch {
      // Unique index caught a race between two confirmation paths firing
      // near-simultaneously (e.g. webhook + poll) — safe to ignore.
      return { recorded: false };
    }
  }

  static async markCommissionsPaid(agentId: number, commissionIds?: number[]) {
    const now = new Date();
    const condition = commissionIds && commissionIds.length > 0
      ? and(eq(agentCommissions.agentId, agentId), eq(agentCommissions.status, 'pending'), inArray(agentCommissions.id, commissionIds))
      : and(eq(agentCommissions.agentId, agentId), eq(agentCommissions.status, 'pending'));

    const result = await db
      .update(agentCommissions)
      .set({ status: 'paid', paidAt: now })
      .where(condition)
      .returning();

    return { count: result.length, totalRwf: result.reduce((s, r) => s + r.commissionRwf, 0) };
  }

  // ==========================================================
  // Bulk import — reads the exact kind of spreadsheet Kosmotive's team
  // already uses (Name, Code, Phone, Email, [Region]), upserting by the
  // reseller `code` so re-uploading a partially-updated file never
  // creates duplicates. Accepts .xlsx, .xls, or .csv (SheetJS reads all
  // three from the same buffer).
  // ==========================================================
  static async importFromSpreadsheet(buffer: Buffer): Promise<{
    created: number; updated: number; skipped: number; errors: string[];
  }> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    let created = 0, updated = 0, skipped = 0;
    const errors: string[] = [];
    const defaultBps = await this.getDefaultCommissionBps();

    const pick = (row: Record<string, any>, keys: string[]) => {
      for (const k of Object.keys(row)) {
        if (keys.includes(k.trim().toLowerCase())) return String(row[k]).trim();
      }
      return '';
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = pick(row, ['name', 'reseller name', 'agent name']);
      const code = pick(row, ['code', 'reseller code', 'wallet id']);
      const phoneRaw = pick(row, ['phone', 'number', 'phone number']);
      const email = pick(row, ['email']);
      const region = pick(row, ['tags', 'region', 'province']);

      if (!name || !code) {
        skipped++;
        errors.push(`Row ${i + 2}: missing name or code — skipped`);
        continue;
      }

      let phone = phoneRaw.replace(/[^\d+]/g, '');
      if (/^07[0-9]{8}$/.test(phone)) phone = '+250' + phone.slice(1);
      else if (/^7[0-9]{8}$/.test(phone)) phone = '+250' + phone;
      if (!phone) {
        skipped++;
        errors.push(`Row ${i + 2} (${name}): missing/invalid phone — skipped`);
        continue;
      }

      const existing = await this.getAgentByCode(code);
      if (existing) {
        await db
          .update(agents)
          .set({ name, phone, email: email || existing.email, region: region || existing.region, updatedAt: new Date() })
          .where(eq(agents.id, existing.id));
        updated++;
      } else {
        await db.insert(agents).values({
          name,
          code: code.toUpperCase(),
          phone,
          email: email || null,
          region: region || null,
          commissionRateBps: defaultBps,
          status: 'active',
          source: 'import',
        });
        created++;
      }
    }

    return { created, updated, skipped, errors };
  }

  // ==========================================================
  // Export — every agent, plus their computed pending/paid commission
  // totals, as an .xlsx buffer ready to download. Nothing here is a
  // stored/cached figure; it's recomputed from the ledger on every export
  // so it can never go stale.
  // ==========================================================
  static async exportToSpreadsheet(): Promise<Buffer> {
    const list = await this.listAgents();
    const rows = list.map((a) => ({
      Name: a.name,
      Code: a.code,
      Phone: a.phone,
      Email: a.email || '',
      Region: a.region || '',
      District: a.district || '',
      Status: a.status,
      'Commission Rate': `${(a.commissionRateBps / 100).toFixed(1)}%`,
      'Customers': a.customerCount,
      'Orders': a.orderCount,
      'Active PayGo Loans': a.activePayGoLoans,
      'Pending Commission (RWF)': a.pendingCommissionRwf,
      'Paid Commission (RWF)': a.paidCommissionRwf,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Agents');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}

