import { Request, Response, NextFunction } from 'express';

// ============================================
// Generic in-memory sliding-window rate limiter.
// Same shape as the bespoke one already used for /api/admin/login —
// pulled out here so any other public, unauthenticated, brute-forceable
// or spammable endpoint (agent login, agent registration, ...) can reuse
// it without copy-pasting the counter logic.
//
// In-memory means this resets on process restart and isn't shared across
// multiple server instances — fine for a single Render web service; if
// Kosmotive ever scales to multiple instances, swap the Map for Redis.
// ============================================
interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.ip || '0.0.0.0';
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  lockoutMs?: number;
  message?: string;
  keyPrefix: string; // keeps two limiters mounted on different routes from sharing counters
}) {
  const store = new Map<string, AttemptRecord>();
  const lockoutMs = options.lockoutMs ?? options.windowMs;

  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const key = `${options.keyPrefix}:${getClientIp(req)}`;
    const now = Date.now();
    const rec = store.get(key);

    if (rec?.lockedUntil && now < rec.lockedUntil) {
      const retryAfterSeconds = Math.ceil((rec.lockedUntil - now) / 1000);
      res.status(429).json({
        error: options.message || 'Too many requests. Please try again later.',
        retryAfterSeconds,
      });
      return;
    }

    if (!rec || now - rec.firstAttemptAt > options.windowMs) {
      store.set(key, { count: 1, firstAttemptAt: now });
      next();
      return;
    }

    const updatedCount = rec.count + 1;
    if (updatedCount > options.max) {
      const lockedUntil = now + lockoutMs;
      store.set(key, { ...rec, count: updatedCount, lockedUntil });
      const retryAfterSeconds = Math.ceil(lockoutMs / 1000);
      res.status(429).json({
        error: options.message || 'Too many requests. Please try again later.',
        retryAfterSeconds,
      });
      return;
    }

    store.set(key, { ...rec, count: updatedCount });
    next();
  };
}
