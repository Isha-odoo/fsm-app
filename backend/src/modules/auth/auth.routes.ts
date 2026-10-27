import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../../db';
import { requireAuth, signToken, verifyPassword } from '../../auth';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } });

const loginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

// A real hash of a random password, so unknown emails cost the same time as wrong passwords.
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Enter a valid email and password' });

    const { rows } = await pool.query(
      `SELECT id, full_name, role, password_hash, is_active FROM users WHERE email = $1`,
      [body.data.email],
    );
    const user = rows[0];
    const ok = await verifyPassword(body.data.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok || !user.is_active) return res.status(401).json({ error: 'Incorrect email or password' });

    res.json({ token: signToken({ id: user.id, role: user.role }), user: { id: user.id, name: user.full_name, role: user.role } });
  } catch (err) { next(err); }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT id, full_name, role FROM users WHERE id = $1 AND is_active`, [req.user!.id]);
    if (!rows[0]) return res.status(401).json({ error: 'Account disabled' });
    res.json({ id: rows[0].id, name: rows[0].full_name, role: rows[0].role });
  } catch (err) { next(err); }
});
