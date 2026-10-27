import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { config } from './config';
import { pool } from './db';
import { authRouter } from './modules/auth/auth.routes';
import { visitsRouter } from './modules/visits/visits.routes';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { publicRouter } from './modules/public/public.routes';
import { ticketsRouter } from './modules/tickets/tickets.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { invoicesRouter } from './modules/invoices/invoices.routes';
import { usersRouter } from './modules/users/users.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { quotationsRouter } from './modules/quotations/quotations.routes';

const app = express();
app.disable('x-powered-by');
if (config.TRUST_PROXY > 0) app.set('trust proxy', config.TRUST_PROXY);
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()), allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'] }));
app.use(express.json({ limit: '200kb' }));

// Opening the API address in a browser: point people to the web app instead of a bare 404.
app.get('/', (_req, res) => res.json({ service: 'Bhawani FSM API', message: 'This is the API. Open the web app instead.', webApp: config.PUBLIC_URL, health: '/health' }));

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});

app.use('/api/auth', authRouter);
app.use('/api/visits', visitsRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/users', usersRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/quotations', quotationsRouter);
app.use('/api/public', publicRouter); // no login: customer request form

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler: never leak internals or SQL to clients.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid request', details: err.flatten() });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const server = app.listen(config.PORT, () => console.log(`FSM API listening on http://localhost:${config.PORT}`));

const shutdown = () => { server.close(() => pool.end().then(() => process.exit(0))); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
