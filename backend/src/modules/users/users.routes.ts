/**
 * Employee accounts (mounted at /api/users). ADMIN only.
 *   GET   /       all employees
 *   POST  /       create an employee login { name, email, phone?, role, password }
 *   PATCH /:id    { name?, phone?, role?, isActive?, password? }  (password = reset)
 *
 * Roles: ADMIN sees and does everything. DISPATCHER dispatches and reads reports and inventory.
 * TECHNICIAN only sees tickets assigned to them (enforced in the visits module).
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { hashPassword, requireAuth, requireRole } from '../../auth';
import { HttpError, handle, uuidParam } from '../../http';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('ADMIN'));

const ROLES = ['ADMIN', 'DISPATCHER', 'TECHNICIAN'] as const;
const password = z.string().min(10, 'Password must be at least 10 characters').max(200);

const SELECT = `SELECT id, full_name AS name, email, phone, role, is_active AS "isActive", created_at AS "createdAt" FROM users`;

usersRouter.get('/', handle(async (_req, res) => {
  const { rows } = await pool.query(`${SELECT} ORDER BY is_active DESC, role, full_name`);
  res.json(rows);
}));

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(30).optional(),
  role: z.enum(ROLES),
  password,
});

usersRouter.post('/', handle(async (req, res) => {
  const b = createSchema.parse(req.body);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, phone, role, password_hash) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name AS name, email, phone, role, is_active AS "isActive", created_at AS "createdAt"`,
      [b.name, b.email, b.phone || null, b.role, await hashPassword(b.password)],
    );
    await pool.query(`INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1, 'user.create', 'user', $2, $3)`,
      [req.user!.id, rows[0].id, JSON.stringify({ email: b.email, role: b.role })]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'An employee with this email already exists');
    throw err;
  }
}));

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
});

usersRouter.patch('/:id', handle(async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const b = patchSchema.parse(req.body);

  if (id === req.user!.id && ((b.role && b.role !== 'ADMIN') || b.isActive === false)) {
    throw new HttpError(409, 'You cannot remove your own admin access');
  }
  if (b.isActive === false || (b.role && b.role !== 'TECHNICIAN')) {
    const open = await pool.query(`SELECT count(*)::int AS n FROM visits WHERE technician_id = $1 AND status IN ('SCHEDULED', 'CHECKED_IN')`, [id]);
    if (open.rows[0].n > 0) throw new HttpError(409, `This employee still has ${open.rows[0].n} open ticket(s). Reassign them first.`);
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (b.name !== undefined) add('full_name', b.name);
  if (b.phone !== undefined) add('phone', b.phone || null);
  if (b.role !== undefined) add('role', b.role);
  if (b.isActive !== undefined) add('is_active', b.isActive);
  if (b.password !== undefined) add('password_hash', await hashPassword(b.password));
  if (sets.length === 0) throw new HttpError(400, 'Nothing to update');

  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}
     RETURNING id, full_name AS name, email, phone, role, is_active AS "isActive", created_at AS "createdAt"`, vals);
  if (!rows[0]) throw new HttpError(404, 'Employee not found');
  await pool.query(`INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1, 'user.update', 'user', $2, $3)`,
    [req.user!.id, id, JSON.stringify({ fields: Object.keys(b).map((k) => (k === 'password' ? 'password (reset)' : k)) })]);
  res.json(rows[0]);
}));
