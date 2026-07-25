import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../config/database';
import { admins } from '../db/schema';
import { signAdminToken, requireAdmin, AuthedRequest } from '../middleware/auth';

const router = Router();

// POST /api/admin/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const [admin] = await db.select().from(admins).where(eq(admins.email, email.toLowerCase().trim()));

    if (!admin || !admin.isActive) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    await db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id));

    const token = signAdminToken({ id: admin.id, email: admin.email, role: admin.role || 'admin' });

    res.json({
      success: true,
      token,
      admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/admin/me — verify token / fetch current admin profile
router.get('/me', requireAdmin, (req: AuthedRequest, res: Response): void => {
  res.json({ success: true, admin: req.admin });
});

export default router;
