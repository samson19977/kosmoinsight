import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../config/database';
import { admins } from '../db/schema';
import { signAdminToken, requireAdmin, AuthedRequest } from '../middleware/auth';
import { MomoService } from '../services/momo.service';

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

// GET /api/admin/momo-check — diagnostic: confirms MoMo env vars are present
// and that MTN actually accepts them (real token fetch), without exposing
// any secret values in the response. Admin-only since it makes a live call.
router.get('/momo-check', requireAdmin, async (_req: AuthedRequest, res: Response): Promise<void> => {
  const result = await MomoService.testConnection();
  res.status(result.ok ? 200 : 502).json(result);
});

// GET /api/admin/momo-roundtrip-check — TEMPORARY diagnostic. Runs a full
// POST requesttopay + immediate GET status cycle from Render's own runtime
// (same network path the real app uses), using raw axios calls independent
// of MomoService, so we can compare this against the same test run from a
// local machine and isolate whether a failure is IP/environment-specific
// or a bug in our service code. Remove this route once MoMo status checks
// are confirmed working end-to-end — it burns a real sandbox transaction
// on every call.
router.get('/momo-roundtrip-check', requireAdmin, async (_req: AuthedRequest, res: Response): Promise<void> => {
  const axios = (await import('axios')).default;
  const { v4: uuidv4 } = await import('uuid');

  const baseUrl = process.env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
  const subscriptionKey = process.env.MOMO_SUBSCRIPTION_KEY || '';
  const collectionUserId = process.env.MOMO_COLLECTION_USER_ID || '';
  const apiKey = process.env.MOMO_API_KEY || '';
  const environment = process.env.MOMO_ENVIRONMENT || 'sandbox';

  const steps: Record<string, any> = {};

  try {
    // Step 1: token
    const credentials = Buffer.from(`${collectionUserId}:${apiKey}`).toString('base64');
    const tokenResp = await axios.post(
      `${baseUrl}/collection/token/`,
      {},
      { headers: { Authorization: `Basic ${credentials}`, 'Ocp-Apim-Subscription-Key': subscriptionKey, 'X-Target-Environment': environment } }
    );
    const accessToken = tokenResp.data.access_token;
    steps.token = { ok: true, tokenLength: accessToken?.length || 0 };

    // Step 2: POST requesttopay
    const referenceId = uuidv4();
    let postStatus: number | null = null;
    try {
      const postResp = await axios.post(
        `${baseUrl}/collection/v1_0/requesttopay`,
        {
          amount: '500',
          currency: 'EUR',
          externalId: 'diag-roundtrip',
          payer: { partyIdType: 'MSISDN', partyId: '250784602833' },
          payerMessage: 'diag',
          payeeNote: 'diag',
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Reference-Id': referenceId,
            'X-Target-Environment': environment,
            'Ocp-Apim-Subscription-Key': subscriptionKey,
            'Content-Type': 'application/json',
          },
        }
      );
      postStatus = postResp.status;
      steps.post = { httpStatus: postStatus, referenceId };
    } catch (postErr: any) {
      steps.post = { httpStatus: postErr?.response?.status, data: postErr?.response?.data, referenceId };
    }

    // Step 3: immediate GET status, same token, same reference
    try {
      const getResp = await axios.get(`${baseUrl}/collection/v1_0/requesttopay/${referenceId}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'X-Target-Environment': environment, 'Ocp-Apim-Subscription-Key': subscriptionKey },
      });
      steps.get = { httpStatus: getResp.status, data: getResp.data };
    } catch (getErr: any) {
      steps.get = { httpStatus: getErr?.response?.status, data: getErr?.response?.data };
    }

    res.json({ success: true, steps });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, steps });
  }
});

export default router;

// ============================================
// TEMPORARY diagnostics for isolating the delayed-GET 404 issue.
// Remove once resolved.
// ============================================

// POST /api/admin/momo-diag-initiate — same as MomoService.initiatePayment,
// but returns the raw referenceId so we can test it again after a delay.
router.post('/momo-diag-initiate', requireAdmin, async (req: AuthedRequest, res: Response): Promise<void> => {
  const axios = (await import('axios')).default;
  const { v4: uuidv4 } = await import('uuid');

  const baseUrl = process.env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
  const subscriptionKey = process.env.MOMO_SUBSCRIPTION_KEY || '';
  const collectionUserId = process.env.MOMO_COLLECTION_USER_ID || '';
  const apiKey = process.env.MOMO_API_KEY || '';
  const environment = process.env.MOMO_ENVIRONMENT || 'sandbox';

  try {
    const credentials = Buffer.from(`${collectionUserId}:${apiKey}`).toString('base64');
    const tokenResp = await axios.post(
      `${baseUrl}/collection/token/`,
      {},
      { headers: { Authorization: `Basic ${credentials}`, 'Ocp-Apim-Subscription-Key': subscriptionKey, 'X-Target-Environment': environment } }
    );
    const accessToken = tokenResp.data.access_token;

    const referenceId = uuidv4();
    const postResp = await axios.post(
      `${baseUrl}/collection/v1_0/requesttopay`,
      {
        amount: '500',
        currency: 'EUR',
        externalId: 'diag-delay-test',
        payer: { partyIdType: 'MSISDN', partyId: '250784602833' },
        payerMessage: 'diag',
        payeeNote: 'diag',
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Reference-Id': referenceId,
          'X-Target-Environment': environment,
          'Ocp-Apim-Subscription-Key': subscriptionKey,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({ success: true, referenceId, postHttpStatus: postResp.status, initiatedAt: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.response?.data || error.message });
  }
});

// GET /api/admin/momo-diag-status/:referenceId — fetches a FRESH token
// (exactly like the real reconciliation poll does) and checks status for
// a referenceId created earlier, however long ago. Use this on a reference
// returned by momo-diag-initiate, after waiting a few minutes.
router.get('/momo-diag-status/:referenceId', requireAdmin, async (req: AuthedRequest, res: Response): Promise<void> => {
  const axios = (await import('axios')).default;

  const baseUrl = process.env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
  const subscriptionKey = process.env.MOMO_SUBSCRIPTION_KEY || '';
  const collectionUserId = process.env.MOMO_COLLECTION_USER_ID || '';
  const apiKey = process.env.MOMO_API_KEY || '';
  const environment = process.env.MOMO_ENVIRONMENT || 'sandbox';

  try {
    const credentials = Buffer.from(`${collectionUserId}:${apiKey}`).toString('base64');
    const tokenResp = await axios.post(
      `${baseUrl}/collection/token/`,
      {},
      { headers: { Authorization: `Basic ${credentials}`, 'Ocp-Apim-Subscription-Key': subscriptionKey, 'X-Target-Environment': environment } }
    );
    const accessToken = tokenResp.data.access_token;

    const getResp = await axios.get(`${baseUrl}/collection/v1_0/requesttopay/${req.params.referenceId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Target-Environment': environment, 'Ocp-Apim-Subscription-Key': subscriptionKey },
    });
    res.json({ success: true, httpStatus: getResp.status, data: getResp.data, checkedAt: new Date().toISOString() });
  } catch (error: any) {
    res.status(200).json({
      success: false,
      httpStatus: error?.response?.status,
      data: error?.response?.data,
      checkedAt: new Date().toISOString(),
    });
  }
});
