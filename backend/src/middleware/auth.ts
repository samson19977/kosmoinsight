import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
    const payload = jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: string };
    req.admin = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired admin session. Please log in again.' });
  }
}

export function signAdminToken(admin: { id: number; email: string; role: string }): string {
  return jwt.sign(admin, JWT_SECRET, { expiresIn: '12h' });
}
