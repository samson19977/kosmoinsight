import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../config/database';
import { agents } from '../db/schema';

export interface AuthedRequest extends Request {
  admin?: { id: number; email: string; role: string };
}

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_to_a_strong_random_secret';

// Protects any route that only the Kosmotive admin/dashboard should reach.
// Expects: Authorization: Bearer <token>
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing admin token. Please log in.' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: string; scope?: string };
    // An agent token must never work on an admin route, even though both
    // are signed with the same secret — the `scope` claim keeps the two
    // roles from ever being interchangeable.
    if (payload.scope === 'agent') {
      res.status(403).json({ error: 'Agent accounts cannot access admin resources.' });
      return;
    }
    req.admin = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired admin session. Please log in again.' });
  }
}

export function signAdminToken(admin: { id: number; email: string; role: string }): string {
  return jwt.sign({ ...admin, scope: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
}

// ============================================
// AGENT AUTHENTICATION
// Deliberately separate from admin auth end to end — different token
// scope, different middleware, and (below) a live re-check of the
// agent's status against the database on every request rather than
// trusting whatever status was baked into the token at login time. If an
// admin suspends an agent mid-session, that agent's existing token stops
// working on the very next request, not just at next login.
// ============================================
export interface AgentAuthedRequest extends Request {
  agent?: { id: number; code: string; name: string; status: string; commissionRateBps: number };
}

export function signAgentToken(agent: { id: number; code: string }): string {
  return jwt.sign({ id: agent.id, code: agent.code, scope: 'agent' }, JWT_SECRET, { expiresIn: '12h' });
}

export async function requireAgent(req: AgentAuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing agent token. Please log in.' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: number; scope?: string };
    if (payload.scope !== 'agent') {
      res.status(403).json({ error: 'This resource is only accessible to agent accounts.' });
      return;
    }

    const [agent] = await db.select().from(agents).where(eq(agents.id, payload.id));
    if (!agent) {
      res.status(401).json({ error: 'Agent account not found. Please log in again.' });
      return;
    }
    if (agent.status !== 'approved' && agent.status !== 'active') {
      res.status(403).json({ error: `Your agent account is currently "${agent.status}" and cannot access this yet. Contact Kosmotive support.` });
      return;
    }

    req.agent = { id: agent.id, code: agent.code, name: agent.name, status: agent.status, commissionRateBps: agent.commissionRateBps };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired agent session. Please log in again.' });
  }
}
