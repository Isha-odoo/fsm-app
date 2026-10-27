/**
 * Creates the first administrator on a real (production) database, without the demo data that `npm run seed` adds.
 *   ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='a long password' ADMIN_NAME='Your Name' npm run create-admin
 * Then sign in and create everybody else under Admin > Employees.
 */
import { pool } from './db';
import { hashPassword } from './auth';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Administrator';
  if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD.');
  if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters.');
  const { rowCount } = await pool.query(
    `INSERT INTO users (full_name, email, role, password_hash) VALUES ($1, $2, 'ADMIN', $3) ON CONFLICT (email) DO NOTHING`,
    [name, email, await hashPassword(password)],
  );
  console.log(rowCount ? `Administrator ${email} created.` : `A user with ${email} already exists. Nothing changed.`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
