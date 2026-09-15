import { eq, and, desc } from 'drizzle-orm';
import { db } from '../config/database';
import { adminAuditLog, admins } from '../db/schema';

// ============================================
// Generic admin-action audit trail. Anything a domain-specific ledger
// doesn't already cover (loan_transactions for money movement,
// stock_movements for inventory) goes through here — currently the agent
// lifecycle actions (approve/reject/suspend/reactivate/reset-password/
// commission-rate change), but deliberately generic so more admin
// actions can log through the same table later.
// ============================================
export class AuditService {
  static async log(input: {
    adminId?: number | null;
    action: string;
    targetType: string;
    targetId: number;
    details?: Record<string, any> | string | null;
  }): Promise<void> {
    try {
      await db.insert(adminAuditLog).values({
        adminId: input.adminId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        details: input.details
          ? (typeof input.details === 'string' ? input.details : JSON.stringify(input.details))
          : null,
      });
    } catch (err) {
      // Audit logging is best-effort — never let a logging failure block
      // or roll back the admin action itself.
      console.error('Audit log write failed (non-fatal):', err);
    }
  }

  static async getForTarget(targetType: string, targetId: number) {
    const rows = await db
      .select({
        id: adminAuditLog.id,
        action: adminAuditLog.action,
        details: adminAuditLog.details,
        createdAt: adminAuditLog.createdAt,
        adminName: admins.name,
      })
      .from(adminAuditLog)
      .leftJoin(admins, eq(adminAuditLog.adminId, admins.id))
      .where(and(eq(adminAuditLog.targetType, targetType), eq(adminAuditLog.targetId, targetId)))
      .orderBy(desc(adminAuditLog.createdAt));
    return rows;
  }
}
