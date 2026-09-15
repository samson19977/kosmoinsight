import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../config/database';
import { products } from '../db/schema';
import { requireAdmin } from '../middleware/auth';

const router = Router();

// GET /api/products — public storefront catalogue (active products only)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const all = await db.select().from(products);
    const active = all.filter((p) => p.isActive);
    res.json({ success: true, products: active });
  } catch (error) {
    console.error('Fetch products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [product] = await db.select().from(products).where(eq(products.id, id));
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json({ success: true, product });
  } catch (error) {
    console.error('Fetch product error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST /api/products (admin — add a new product to the catalogue)
router.post('/', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, priceRwf, packageType, imageUrl, stock } = req.body;
    if (!name || !priceRwf || !packageType) {
      res.status(400).json({ error: 'name, priceRwf and packageType are required' });
      return;
    }
    const [created] = await db
      .insert(products)
      .values({ name, description, priceRwf, packageType, imageUrl, stock })
      .returning();
    res.status(201).json({ success: true, product: created });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PATCH /api/products/:id (admin — update price, stock, description, active status, etc.)
router.patch('/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const updates = { ...req.body, updatedAt: new Date() };
    delete updates.id;

    const [updated] = await db.update(products).set(updates).where(eq(products.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json({ success: true, product: updated });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

export default router;
