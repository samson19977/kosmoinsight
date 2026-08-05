import { Router, Request, Response } from 'express';
import { desc, sql } from 'drizzle-orm';
import { db } from '../config/database';
import { orders, orderItems, customers } from '../db/schema';
import { requireAdmin } from '../middleware/auth';

const router = Router();
router.use(requireAdmin);

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

function isPaid(paymentStatus: string | null): boolean {
  return paymentStatus === 'paid';
}

// ============================================
// GET /api/admin/dashboard
// Business overview: revenue, counts, trend, top products,
// recent orders, and orders pending payment confirmation.
// ============================================
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));
    const paidOrders = allOrders.filter((o) => isPaid(o.paymentStatus));

    // ---- Revenue ----
    const today = startOfDay(new Date());
    const day7 = daysAgo(7);
    const day30 = daysAgo(30);

    const sumRevenue = (list: typeof paidOrders) =>
      list.reduce((sum, o) => sum + (o.totalRwf || 0), 0);

    const revenueToday = sumRevenue(
      paidOrders.filter((o) => o.createdAt && new Date(o.createdAt) >= today)
    );
    const revenueLast7Days = sumRevenue(
      paidOrders.filter((o) => o.createdAt && new Date(o.createdAt) >= day7)
    );
    const revenueLast30Days = sumRevenue(
      paidOrders.filter((o) => o.createdAt && new Date(o.createdAt) >= day30)
    );
    const revenueAllTime = sumRevenue(paidOrders);
    const averageOrderValueRwf =
      paidOrders.length > 0 ? Math.round(revenueAllTime / paidOrders.length) : 0;

    // ---- Counts ----
    const [{ count: totalCustomers }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers);

    const pendingPaymentConfirmations = allOrders.filter(
      (o) => o.paymentStatus === 'pending' || o.paymentStatus === 'pending_manual'
    ).length;

    // ---- Revenue trend (last 14 days) ----
    const trendMap = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = daysAgo(i);
      trendMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const o of paidOrders) {
      if (!o.createdAt) continue;
      const key = new Date(o.createdAt).toISOString().slice(0, 10);
      if (trendMap.has(key)) {
        trendMap.set(key, (trendMap.get(key) || 0) + (o.totalRwf || 0));
      }
    }
    const revenueTrend14Days = Array.from(trendMap.entries()).map(([date, revenueRwf]) => ({
      date,
      revenueRwf,
    }));

    // ---- Top products by revenue (paid orders only) ----
    const paidOrderIds = new Set(paidOrders.map((o) => o.id));
    const allItems = await db.select().from(orderItems);
    const productRevenue = new Map<string, number>();
    for (const item of allItems) {
      if (!paidOrderIds.has(item.orderId)) continue;
      const key = item.productName;
      productRevenue.set(key, (productRevenue.get(key) || 0) + (item.subtotalRwf || 0));
    }
    const topProducts = Array.from(productRevenue.entries())
      .map(([name, revenueRwf]) => ({ name, revenueRwf }))
      .sort((a, b) => b.revenueRwf - a.revenueRwf)
      .slice(0, 6);

    // ---- Recent orders (latest 8) ----
    const recentOrders = allOrders.slice(0, 8).map((o) => ({
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      totalRwf: o.totalRwf,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt,
    }));

    // ---- Pending confirmation (oldest first, capped at 10) ----
    const pendingConfirmation = allOrders
      .filter((o) => o.paymentStatus === 'pending' || o.paymentStatus === 'pending_manual')
      .slice(-10)
      .reverse()
      .map((o) => ({
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        totalRwf: o.totalRwf,
      }));

    res.json({
      success: true,
      revenue: {
        today: revenueToday,
        last7Days: revenueLast7Days,
        last30Days: revenueLast30Days,
        allTime: revenueAllTime,
        averageOrderValueRwf,
      },
      counts: {
        totalOrders: allOrders.length,
        totalCustomers,
        pendingPaymentConfirmations,
      },
      revenueTrend14Days,
      topProducts,
      recentOrders,
      pendingConfirmation,
    });
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

export default router;
