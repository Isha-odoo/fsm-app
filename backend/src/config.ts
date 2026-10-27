import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  PUBLIC_URL: z.string().default('http://localhost:3000'),
  NODE_ENV: z.string().default('development'),
  // GST state code of the seller (24 = Gujarat). Same state as the customer site => CGST+SGST, otherwise IGST.
  SELLER_STATE_CODE: z.string().regex(/^\d{2}$/).default('24'),
  // Printed on quotations and invoices. Set your real details in backend/.env.
  COMPANY_NAME: z.string().default('Bhawani Print & Pack'),
  COMPANY_ADDRESS: z.string().default(''),
  COMPANY_GSTIN: z.string().default(''),
  COMPANY_PHONE: z.string().default(''),
  COMPANY_EMAIL: z.string().default(''),
  // Number of reverse proxies in front of the API (needed so the public form's rate limit sees real client IPs).
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(` - ${issue.path.join('.')}: ${issue.message}`);
  console.error('Copy .env.example to .env and fill it in.');
  process.exit(1);
}

export const config = parsed.data;
// visits.routes.ts reads PUBLIC_URL from process.env
process.env.PUBLIC_URL = config.PUBLIC_URL;
