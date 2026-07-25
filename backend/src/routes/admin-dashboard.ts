import { Router, Request, Response } from 'express';
import { db } from '../config/database';
import { orders, orderItems, customers, products } from '../db/schema';
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

// GET /api/admin/dashboard — the main "business at a glance" endpoint
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [allOrders, allItems, allCustomers, allProducts] = await Promise.all([
      db.select().from(orders),
      db.select().from(orderItems),
      db.select().from(customers),
      db.select().from(products),
    ]);

    const paidOrders = allOrders.filter((o) => o.paymentStatus === 'paid');
    const todayStart = startOfDay(new Date());
    const weekStart = daysAgo(6); // last 7 days incl. today
    const monthStart = daysAgo(29); // last 30 days incl. today

    const sumRevenue = (list: typeof paidOrders) => list.reduce((sum, o) => sum + o.totalRwf, 0);

    const revenueToday = sumRevenue(paidOrders.filter((o) => new Date(o.createdAt!) >= todayStart));
    const revenueThisWeek = sumRevenue(paidOrders.filter((o) => new Date(o.createdAt!) >= weekStart));
    const revenueThisMonth = sumRevenue(paidOrders.filter((o) => new Date(o.createdAt!) >= monthStart));
    const revenueAllTime = sumRevenue(paidOrders);

    // Orders by fulfilment status
    const ordersByStatus: Record<string, number> = {};
    for (const o of allOrders) {
      const key = o.orderStatus || 'pending';
      ordersByStatus[key] = (ordersByStatus[key] || 0) + 1;
    }

    // Payments by status
    const paymentsByStatus: Record<string, number> = {};
    for (const o of allOrders) {
      const key = o.paymentStatus || 'pending';
      paymentsByStatus[key] = (paymentsByStatus[key] || 0) + 1;
    }

    // Revenue trend — last 14 days (paid orders)
    const trend: { date: string; revenueRwf: number; orders: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const dayStart = daysAgo(i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const dayOrders = paidOrders.filter((o) => {
        const t = new Date(o.createdAt!);
        return t >= dayStart && t < dayEnd;
      });
      trend.push({
        date: dayStart.toISOString().slice(0, 10),
        revenueRwf: sumRevenue(dayOrders),
        orders: dayOrders.length,
      });
    }

    // Top products — by revenue and by quantity (only counted against paid orders)
    const paidOrderIds = new Set(paidOrders.map((o) => o.id));
    const productAgg: Record<string, { name: string; quantity: number; revenueRwf: number }> = {};
    for (const item of allItems) {
      if (!paidOrderIds.has(item.orderId)) continue;
      if (!productAgg[item.productName]) {
        productAgg[item.productName] = { name: item.productName, quantity: 0, revenueRwf: 0 };
      }
      productAgg[item.productName].quantity += item.quantity;
      productAgg[item.productName].revenueRwf += item.subtotalRwf;
    }
    const topProducts = Object.values(productAgg).sort((a, b) => b.revenueRwf - a.revenueRwf);

    // Recent orders (latest 10, any status)
    const recentOrders = [...allOrders]
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, 10)
      .map((o) => ({
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        totalRwf: o.totalRwf,
        orderStatus: o.orderStatus,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
      }));

    // Orders awaiting manual payment confirmation — the admin's action queue
    const pendingConfirmation = allOrders
      .filter((o) => o.paymentStatus === 'pending')
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime())
      .map((o) => ({
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        totalRwf: o.totalRwf,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
      }));

    const avgOrderValue = paidOrders.length > 0 ? Math.round(revenueAllTime / paidOrders.length) : 0;

    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      revenue: {
        today: revenueToday,
        last7Days: revenueThisWeek,
        last30Days: revenueThisMonth,
        allTime: revenueAllTime,
        averageOrderValueRwf: avgOrderValue,
      },
      counts: {
        totalOrders: allOrders.length,
        totalPaidOrders: paidOrders.length,
        totalCustomers: allCustomers.length,
        totalActiveProducts: allProducts.filter((p) => p.isActive).length,
        pendingPaymentConfirmations: pendingConfirmation.length,
      },
      ordersByStatus,
      paymentsByStatus,
      revenueTrend14Days: trend,
      topProducts,
      recentOrders,
      pendingConfirmation,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to build dashboard' });
  }
});

export default router;
