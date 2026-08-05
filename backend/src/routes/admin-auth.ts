import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../config/database';
import { admins } from '../db/schema';
import { signAdminToken, requireAdmin, AuthedRequest } from '../middleware/auth';

const router = Router();

// ============================================
// In-memory login rate limiter
// Tracks failed attempts per IP address.
// After MAX_ATTEMPTS failures within WINDOW_MS, the IP is locked for LOCKOUT_MS.
// ============================================
interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

const loginAttemptStore = new Map<string, AttemptRecord>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;  // 15-minute sliding window
const LOCKOUT_MS = 15 * 60 * 1000; // 15-minute lockout

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.ip || '0.0.0.0';
}

function checkLoginAllowed(ip: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const rec = loginAttemptStore.get(ip);

  if (!rec) return { allowed: true, remaining: MAX_ATTEMPTS, retryAfterMs: 0 };

  // Locked?
  if (rec.lockedUntil && now < rec.lockedUntil) {
    return { allowed: false, remaining: 0, retryAfterMs: rec.lockedUntil - now };
  }

  // Window expired — reset
  if (now - rec.firstAttemptAt > WINDOW_MS) {
    loginAttemptStore.delete(ip);
    return { allowed: true, remaining: MAX_ATTEMPTS, retryAfterMs: 0 };
  }

  if (rec.count >= MAX_ATTEMPTS) {
    // Shouldn't normally reach here without lockedUntil, but be safe
    return { allowed: false, remaining: 0, retryAfterMs: LOCKOUT_MS };
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - rec.count, retryAfterMs: 0 };
}

function recordFailedAttempt(ip: string): { remaining: number; lockedUntil?: number } {
  const now = Date.now();
  const rec = loginAttemptStore.get(ip);

  let updated: AttemptRecord;
  if (!rec || now - rec.firstAttemptAt > WINDOW_MS) {
    updated = { count: 1, firstAttemptAt: now };
  } else {
    updated = { ...rec, count: rec.count + 1 };
  }

  if (updated.count >= MAX_ATTEMPTS) {
    updated.lockedUntil = now + LOCKOUT_MS;
  }

  loginAttemptStore.set(ip, updated);

  return {
    remaining: Math.max(0, MAX_ATTEMPTS - updated.count),
    lockedUntil: updated.lockedUntil,
  };
}

function clearAttempts(ip: string): void {
  loginAttemptStore.delete(ip);
}

// ============================================
// POST /api/admin/login
// ============================================
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);

  try {
    // Rate-limit check — respond before hitting the DB
    const limitCheck = checkLoginAllowed(ip);
    if (!limitCheck.allowed) {
      const secs = Math.ceil(limitCheck.retryAfterMs / 1000);
      const mins = Math.ceil(secs / 60);
      res.status(429).json({
        error: `Too many failed login attempts. Please try again in ${mins} minute${mins !== 1 ? 's' : ''}.`,
        retryAfterSeconds: secs,
        locked: true,
      });
      return;
    }

    const { email, password } = req.body;

    // Generic validation — never reveal which field is wrong
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Always do the DB lookup (constant-time behaviour against user-enumeration)
    const [admin] = await db
      .select()
      .from(admins)
      .where(eq(admins.email, email.toLowerCase().trim()));

    // Validate password (bcrypt.compare is safe even when admin is undefined via dummy hash)
    const DUMMY_HASH = '$2b$10$dummyhashtopreventtimingattacks0000000000000000000000';
    const hashToCheck = admin?.passwordHash ?? DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCheck);

    if (!admin || !admin.isActive || !valid) {
      const attempt = recordFailedAttempt(ip);
      const msg =
        attempt.remaining > 0
          ? `Incorrect credentials. ${attempt.remaining} attempt${attempt.remaining !== 1 ? 's' : ''} remaining.`
          : `Too many failed attempts. Account is locked for 15 minutes.`;

      res.status(401).json({
        error: msg,
        attemptsRemaining: attempt.remaining,
        locked: attempt.remaining === 0,
      });
      return;
    }

    // Successful login — clear any previous failed attempts
    clearAttempts(ip);
    await db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id));

    const token = signAdminToken({ id: admin.id, email: admin.email, role: admin.role || 'admin' });

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        // NOTE: email intentionally omitted from response to prevent username leakage
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// GET /api/admin/me — verify token / fetch current admin profile
router.get('/me', requireAdmin, (req: AuthedRequest, res: Response): void => {
  res.json({ success: true, admin: req.admin });
});

export default router;
