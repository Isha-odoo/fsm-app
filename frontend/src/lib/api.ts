import type {
  AssignRequest, CatalogItem, DocumentData, InvoiceRow, QuotationRow, QuotePreview, QuoteStatus, Employee, EmployeeUpdate, InventoryInput, InventoryItem, InvoicePreview, InvoiceRequest, InvoiceSummary,
  IssueCategory, NewEmployee, NewTicketPayload, PublicCatalog, ReportFilters, SolvePayload, SolveResult, TechnicianStats, Ticket,
  TicketReport, TicketStatus, Visit, Warranty, CustomerStats, ItemType,
} from './types';
import { todayIST } from './format';

// The API server. For a phone build (APK) this must be the public https address of your API.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://fsm-app.onrender.com/api';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** Who is signed in (kept in the browser so each employee gets their own window). */
export const session = {
  set(token: string, user: { id: string; name: string; role: string; email?: string }) {
    window.localStorage.setItem('fsm_token', token);
    window.localStorage.setItem('fsm_uid', user.id);
    if (user.email) window.localStorage.setItem('fsm_email', user.email);
    window.localStorage.setItem('fsm_role', user.role);
    window.localStorage.setItem('fsm_name', user.name);
  },
  clear() {
    for (const k of ['fsm_token', 'fsm_uid', 'fsm_role', 'fsm_name', 'fsm_email']) window.localStorage.removeItem(k);
  },
  id: () => window.localStorage.getItem('fsm_uid'),
  role: () => window.localStorage.getItem('fsm_role'),
  name: () => window.localStorage.getItem('fsm_name'),
  email: () => window.localStorage.getItem('fsm_email'),
};

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  // TODO (production): short-lived access token in memory + httpOnly refresh cookie instead of localStorage.
  // Public endpoints (/public/*) work without a token; it is simply not needed there.
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('fsm_token') : null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login') && !path.startsWith('/public/')) {
      session.clear();
      window.location.href = '/login';
    }
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? res.statusText, body.details);
  }
  return res.json() as Promise<T>;
}

const send = <T,>(method: 'POST' | 'PATCH', path: string, body: unknown, headers?: Record<string, string>) =>
  http<T>(path, { method, body: JSON.stringify(body), headers });
const post = <T,>(path: string, body: unknown, headers?: Record<string, string>) => send<T>('POST', path, body, headers);

/** Query string from a plain object, skipping empty values. */
function qs(params: Record<string, string | string[] | boolean | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)) continue;
    u.set(k, Array.isArray(v) ? v.join(',') : v === true ? '1' : v);
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

export const api = {
  login: (email: string, password: string): Promise<{ token: string; user: { id: string; name: string; role: string } }> =>
    post('/auth/login', { email, password }),

  changePassword: (currentPassword: string, newPassword: string): Promise<{ ok: boolean }> => post('/auth/change-password', { currentPassword, newPassword }),

  // ───────── technician ─────────
  getMyVisits: (date: string = todayIST()): Promise<Visit[]> => http(`/visits/me${qs({ date })}`),
  getVisit: (id: string): Promise<Visit> => http(`/visits/${id}`),
  getVisitWarranty: (id: string): Promise<Warranty | null> => http(`/visits/${id}/warranty`),
  checkIn: (id: string, coords?: { lat: number; lng: number }): Promise<{ ok: boolean }> => post(`/visits/${id}/check-in`, coords ?? {}),

  /** Parts, consumables and services with prices: what a technician may quote on site. */
  getCatalog: (types: string = 'PART,CONSUMABLE,SERVICE'): Promise<CatalogItem[]> => http(`/catalog${qs({ type: types })}`),
  getIssueCategories: (): Promise<IssueCategory[]> => http('/catalog/issue-categories'),

  /** Prices the items on the server (warranty-aware, with GST) without saving anything. */
  previewSolve: (id: string, items: SolvePayload['items']): Promise<QuotePreview> => post(`/visits/${id}/solve/preview`, { items }),

  /** Marks the ticket solved and creates the customer's quotation. Idempotency-Key: once per form, reused on retries. */
  solveVisit: (id: string, payload: SolvePayload, idempotencyKey: string): Promise<SolveResult> =>
    post(`/visits/${id}/solve`, payload, { 'Idempotency-Key': idempotencyKey }),

  // ───────── quotations ─────────
  getQuotations: (f: { status?: QuoteStatus; q?: string; from?: string; to?: string } = {}): Promise<QuotationRow[]> => http(`/quotations${qs({ ...f })}`),
  getQuotation: (id: string): Promise<DocumentData> => http(`/quotations/${id}`),
  shareQuotation: (id: string): Promise<{ url: string }> => post(`/quotations/${id}/share-link`, {}),
  decideQuotation: (id: string, body: { decision: 'APPROVED' | 'REJECTED'; note?: string }): Promise<{ ok: boolean }> => post(`/quotations/${id}/decision`, body),

  // ───────── public customer pages (no login) ─────────
  getPublicQuotation: (token: string): Promise<DocumentData> => http(`/public/quotations/${token}`),
  decidePublicQuotation: (token: string, body: { decision: 'APPROVED' | 'REJECTED'; name: string; note?: string }): Promise<{ ok: boolean }> =>
    post(`/public/quotations/${token}/decision`, body),

  // ───────── public customer form (no login) ─────────
  getPublicCatalog: (): Promise<PublicCatalog> => http('/public/catalog'),
  submitTicket: (payload: NewTicketPayload, idempotencyKey: string): Promise<{ ticketNo: number }> =>
    post('/public/tickets', payload, { 'Idempotency-Key': idempotencyKey }),

  // ───────── admin: dispatch ─────────
  getTickets: (f: { status?: TicketStatus[]; uninvoiced?: boolean; q?: string } = {}): Promise<Ticket[]> =>
    http(`/tickets${qs({ status: f.status, uninvoiced: f.uninvoiced, q: f.q })}`),
  getTicket: (id: string): Promise<Ticket> => http(`/tickets/${id}`),
  assignTicket: (id: string, body: AssignRequest): Promise<{ ok: boolean }> => post(`/tickets/${id}/assign`, body),
  cancelTicket: (id: string, reason: string): Promise<{ ok: boolean }> => post(`/tickets/${id}/cancel`, { reason }),

  // ───────── admin: reports ─────────
  getTicketReport: (f: ReportFilters): Promise<TicketReport> => http(`/reports/tickets${qs({ ...f })}`),
  getTechnicianReport: (range: { from?: string; to?: string } = {}): Promise<TechnicianStats[]> => http(`/reports/technicians${qs(range)}`),
  getCustomerReport: (range: { from?: string; to?: string; q?: string } = {}): Promise<CustomerStats[]> => http(`/reports/customers${qs(range)}`),

  // ───────── admin: invoicing ─────────
  previewInvoice: (body: InvoiceRequest): Promise<InvoicePreview> => post('/invoices/preview', body),
  getInvoices: (f: { q?: string; from?: string; to?: string } = {}): Promise<InvoiceRow[]> => http(`/invoices${qs({ ...f })}`),
  getInvoice: (id: string): Promise<DocumentData> => http(`/invoices/${id}`),
  createInvoice: (body: InvoiceRequest): Promise<InvoicePreview & { invoice: InvoiceSummary }> => post('/invoices', body),

  // ───────── admin: employees ─────────
  getEmployees: (): Promise<Employee[]> => http('/users'),
  createEmployee: (body: NewEmployee): Promise<Employee> => post('/users', body),
  updateEmployee: (id: string, body: EmployeeUpdate): Promise<Employee> => send('PATCH', `/users/${id}`, body),

  // ───────── admin: inventory ─────────
  getInventory: (f: { type?: ItemType; q?: string; inactive?: boolean } = {}): Promise<InventoryItem[]> => http(`/inventory/items${qs({ type: f.type, q: f.q, inactive: f.inactive })}`),
  createItem: (body: InventoryInput): Promise<InventoryItem> => post('/inventory/items', body),
  updateItem: (id: string, body: Partial<Omit<InventoryInput, 'type' | 'sku' | 'openingStock'>> & { isActive?: boolean }): Promise<InventoryItem> =>
    send('PATCH', `/inventory/items/${id}`, body),
  adjustStock: (id: string, body: { qtyDelta: number; reason: 'PURCHASE' | 'ADJUSTMENT'; note?: string }): Promise<InventoryItem> =>
    post(`/inventory/items/${id}/stock`, body),
};
