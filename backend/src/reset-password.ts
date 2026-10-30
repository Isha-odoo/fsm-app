/**
 * Locked out? Sets a new password for any employee directly in the database (run from your own computer).
 *   EMAIL=you@company.com NEW_PASSWORD='a long new password' npm run reset-password
 * Use DATABASE_URL (and DATABASE_SSL=true for Supabase) from your backend/.env or pass them on the command line.
 */
import { pool } from './db';
import { hashPassword } from './auth';

async function main() {
  const email = process.env.EMAIL?.trim();
  const password = process.env.NEW_PASSWORD;
  if (!email || !password) throw new Error('Set EMAIL and NEW_PASSWORD.');
  if (password.length < 10) throw new Error('NEW_PASSWORD must be at least 10 characters.');
  const { rowCount } = await pool.query(`UPDATE users SET password_hash = $2, is_active = true WHERE email = $1`, [email, await hashPassword(password)]);
  console.log(rowCount ? `Password for ${email} has been reset.` : `No employee with the email ${email}.`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
