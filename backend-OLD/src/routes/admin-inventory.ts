import { Router, Request, Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../config/database';
import { products, stockMovements, orders, orderItems } from '../db/schema';
import { requireAdmin, AuthedRequest } from '../middleware/auth';

const router = Router();
router.use(requireAdmin);

// ============================================
// GET /api/admin/inventory
// List all products with current stock levels.
// ============================================
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const allProducts = await db.select().from(products).orderBy(products.name);

    const inventory = allProducts.map((p) => ({
      id: p.id,
      name: p.name,
      packageType: p.packageType,
      priceRwf: p.priceRwf,
      stock: p.stock ?? 0,
      lowStockThreshold: p.lowStockThreshold ?? 10,
      isActive: p.isActive,
      isLowStock: (p.stock ?? 0) <= (p.lowStockThreshold ?? 10),
      isOutOfStock: (p.stock ?? 0) === 0,
      imageUrl: p.imageUrl,
      updatedAt: p.updatedAt,
    }));

    const summary = {
      total: inventory.length,
      active: inventory.filter((p) => p.isActive).length,
      lowStock: inventory.filter((p) => p.isLowStock && !p.isOutOfStock).length,
      outOfStock: inventory.filter((p) => p.isOutOfStock).length,
    };

    res.json({ success: true, inventory, summary });
  } catch (error) {
    console.error('Inventory fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// ============================================
// PATCH /api/admin/inventory/:id/stock
// Adjust stock for a product (restock or correction).
// Body: { newStock: number, reason: string, note?: string }
// ============================================
router.patch('/:id/stock', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    const { newStock, reason, note } = req.body;

    if (typeof newStock !== 'number' || newStock < 0) {
      res.status(400).json({ error: 'newStock must be a non-negative number' });
      return;
    }

    const validReasons = ['restock', 'adjustment', 'correction', 'return'];
    if (!reason || !validReasons.includes(reason)) {
      res.status(400).json({ error: `reason must be one of: ${validReasons.join(', ')}` });
      return;
    }

    const [existing] = await db.select().from(products).where(eq(products.id, id));
    if (!existing) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const changeQty = newStock - (existing.stock ?? 0);

    const [updated] = await db
      .update(products)
      .set({ stock: newStock, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    // Log the movement for audit trail
    await db.insert(stockMovements).values({
      productId: id,
      changeQty,
      reason,
      adminId: req.admin?.id ?? null,
      note: note || null,
    });

    res.json({
      success: true,
      product: {
        id: updated.id,
        name: updated.name,
        stock: updated.stock,
        isLowStock: (updated.stock ?? 0) <= (updated.lowStockThreshold ?? 10),
        isOutOfStock: (updated.stock ?? 0) === 0,
      },
      changeQty,
    });
  } catch (error) {
    console.error('Stock update error:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

// ============================================
// PATCH /api/admin/inventory/:id/threshold
// Update the low-stock alert threshold for a product.
// Body: { threshold: number }
// ============================================
router.patch('/:id/threshold', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { threshold } = req.body;

    if (typeof threshold !== 'number' || threshold < 0) {
      res.status(400).json({ error: 'threshold must be a non-negative number' });
      return;
    }

    const [updated] = await db
      .update(products)
      .set({ lowStockThreshold: threshold, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    res.json({ success: true, product: { id: updated.id, name: updated.name, lowStockThreshold: updated.lowStockThreshold } });
  } catch (error) {
    console.error('Threshold update error:', error);
    res.status(500).json({ error: 'Failed to update threshold' });
  }
});

// ============================================
// GET /api/admin/inventory/:id/movements
// Audit log of stock changes for one product.
// ============================================
router.get('/:id/movements', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, id))
      .orderBy(desc(stockMovements.createdAt))
      .limit(50);

    res.json({ success: true, movements });
  } catch (error) {
    console.error('Stock movements error:', error);
    res.status(500).json({ error: 'Failed to fetch stock movements' });
  }
});

// ============================================
// PATCH /api/admin/inventory/:id/toggle
// Activate or deactivate a product listing.
// ============================================
router.patch('/:id/toggle', async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(products).where(eq(products.id, id));
    if (!existing) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const [updated] = await db
      .update(products)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    res.json({ success: true, product: { id: updated.id, name: updated.name, isActive: updated.isActive } });
  } catch (error) {
    console.error('Product toggle error:', error);
    res.status(500).json({ error: 'Failed to toggle product status' });
  }
});

export default router;
