/**
 * In-memory mock data so the UI runs without the backend (NEXT_PUBLIC_USE_MOCK=true, the default).
 * State lives in this module, so it survives client-side navigation but resets on a full page reload.
 * The technician view is "Ravi" (id t1). Assigning a ticket to Ravi on the admin board puts it on his phone view.
 */
import type {
  AssignRequest, CatalogItem, CustomerStats, InvoiceLine, InvoicePreview, InvoiceRequest, InvoiceSummary, IssueCategory,
  NewTicketPayload, SolvePayload, SolveResult, TechnicianStats, Ticket, TicketStatus, Visit, Warranty,
} from './types';
import { todayIST } from './format';

const delay = <T,>(value: T, ms = 450) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

function at(hour: number, minute = 0): string {
  return `${todayIST()}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`;
}
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const TECHS = [{ id: 't1', name: 'Ravi Technician' }, { id: 't2', name: 'Kiran Technician' }];

// ───────── technician visits (Ravi) ─────────
function buildVisits(): Visit[] {
  return [
  {
    id: 'v1', jobNo: 2041, status: 'SCHEDULED', scheduledFor: at(10, 0),
    customerName: 'Shree Ganesh Traders', customerPhone: '+919825000111',
    siteLabel: 'Head office', address: '12, GIDC Sector 25', city: 'Gandhinagar', latitude: 23.2156, longitude: 72.6369,
    contactName: 'Mehul Patel', contactPhone: '+919825000222',
    description: 'Printer pulls multiple sheets and shows a paper jam error.', issue: 'Paper jam', priority: 1,
    assetId: 'a1', assetModel: 'HP LaserJet Pro M126nw', serialNumber: 'VNB3K12345', serialRecognised: true,
  },
  {
    id: 'v2', jobNo: 2043, status: 'SCHEDULED', scheduledFor: at(12, 30),
    customerName: 'Anand Packaging Pvt Ltd', customerPhone: '+919898000333',
    siteLabel: 'Plant 2', address: 'Plot 88, Kalol Industrial Estate', city: 'Kalol', latitude: 23.2467, longitude: 72.4951,
    contactName: 'Ritu Shah', contactPhone: '+919898000444',
    description: 'Prints come out with faded streaks.', issue: 'Print quality', priority: 2,
    assetId: 'a2', assetModel: 'Canon iR2206N', serialNumber: 'CNX7788991', serialRecognised: true,
  },
  {
    id: 'v3', jobNo: 2044, status: 'CHECKED_IN', scheduledFor: at(15, 0),
    customerName: 'Dr. Desai Clinic', customerPhone: '+919712000555',
    siteLabel: 'Sector 7 Clinic', address: 'Shop 4, Sector 7 Market', city: 'Gandhinagar', latitude: 23.2223, longitude: 72.6491,
    contactName: 'Reception', contactPhone: '+919712000555',
    description: 'Printer not detected on the network after a power cut.', issue: 'Network / connectivity', priority: 2,
    assetId: 'a3', assetModel: 'Epson L3250', serialNumber: 'X4RT221877', serialRecognised: true,
  },
  {
    id: 'v4', jobNo: 2038, status: 'COMPLETED', scheduledFor: at(9, 0),
    customerName: 'Kalpana Stationers', customerPhone: '+919909000666',
    siteLabel: 'Main shop', address: '21, Infocity Road', city: 'Gandhinagar', latitude: null, longitude: null,
    contactName: 'Kalpana Joshi', contactPhone: '+919909000666',
    description: 'Toner replacement requested.', issue: 'Consumables', priority: 3,
    assetId: 'a4', assetModel: 'Brother HL-L2351DW', serialNumber: 'U63877H5J123', serialRecognised: true,
    workDone: 'Replaced toner cartridge and cleaned the pickup roller.',
    parts: [{ description: 'Toner cartridge (black)', quantity: 1, warrantyWaived: false }],
  },
  ];
}

// Built lazily: the dates depend on 'today', which must not be read while Next.js prerenders.
let visitsCache: Visit[] | null = null;
const getVisits = () => (visitsCache ??= buildVisits());

const warranties: Record<string, Warranty> = {
  a1: { status: 'IN_WARRANTY', startDate: '2026-03-01', endDate: '2027-02-28', daysRemaining: 128, billable: false, reason: 'In warranty until 2027-02-28 (128 days left)' },
  a2: { status: 'EXPIRED', startDate: '2024-06-15', endDate: '2025-06-14', daysRemaining: -131, billable: true, reason: 'Warranty expired on 2025-06-14 (131 days ago)' },
  a3: { status: 'NO_RECORD', startDate: null, endDate: null, daysRemaining: null, billable: true, reason: 'No purchase/installation date on file. Verify the original invoice or ask an admin to override.' },
  a4: { status: 'VOID', startDate: '2025-12-01', endDate: null, daysRemaining: null, billable: true, reason: 'Warranty void: liquid damage recorded' },
};

const catalog: CatalogItem[] = [
  { id: 'c1', sku: 'SVC-VISIT', name: 'Service visit charge', type: 'SERVICE', unitPricePaise: 50000, warrantyCovers: true },
  { id: 'c2', sku: 'PRT-ROLLER', name: 'Paper pickup roller', type: 'PART', unitPricePaise: 85000, warrantyCovers: true },
  { id: 'c3', sku: 'PRT-FUSER', name: 'Fuser assembly', type: 'PART', unitPricePaise: 540000, warrantyCovers: true },
  { id: 'c4', sku: 'PRT-DRUM', name: 'Drum unit', type: 'PART', unitPricePaise: 320000, warrantyCovers: true },
  { id: 'c5', sku: 'PRT-HEAD', name: 'Print head', type: 'PART', unitPricePaise: 620000, warrantyCovers: true },
  { id: 'c6', sku: 'PRT-FORMATTER', name: 'Formatter / main board', type: 'PART', unitPricePaise: 780000, warrantyCovers: true },
  { id: 'c7', sku: 'CON-TONER-BLK', name: 'Toner cartridge (black)', type: 'CONSUMABLE', unitPricePaise: 275000, warrantyCovers: false },
  { id: 'c8', sku: 'CON-INK-SET', name: 'Ink bottle set (4 colours)', type: 'CONSUMABLE', unitPricePaise: 120000, warrantyCovers: false },
];

const categories: IssueCategory[] = [
  { id: 1, name: 'Paper jam' }, { id: 2, name: 'Print quality' }, { id: 3, name: 'Network / connectivity' },
  { id: 4, name: 'Consumables' }, { id: 5, name: 'Hardware failure' }, { id: 6, name: 'Error code' },
];

// ───────── admin tickets ─────────
type TicketSeed = Partial<Ticket> & Pick<Ticket, 'id' | 'ticketNo' | 'customerId' | 'customerName' | 'createdAt'>;
const mkTicket = (p: TicketSeed): Ticket => ({
  status: 'NEW', priority: 2, source: 'CUSTOMER', solvedAt: null, contactName: null, phone: null, address: '', city: null,
  serialNumber: null, serialRecognised: true, model: null, issue: null, description: null,
  technicianId: null, technicianName: null, visitStatus: null, warrantyStatus: null, workDone: null, invoice: null, parts: [],
  ...p,
});

function buildTickets(): Ticket[] {
  const ravi = { technicianId: 't1', technicianName: 'Ravi Technician' };
  const kiran = { technicianId: 't2', technicianName: 'Kiran Technician' };
  return [
    mkTicket({ id: 'k2052', ticketNo: 2052, customerId: 'cu5', customerName: 'Patel Print House', contactName: 'Hardik Patel', phone: '+919825111222',
      address: 'Shop 9, Sector 21 Market', city: 'Gandhinagar', serialNumber: 'ZX9981234', serialRecognised: false, issue: 'Error code',
      description: 'Machine shows error E-502 and stops printing.', createdAt: ago(25) }),
    mkTicket({ id: 'k2050', ticketNo: 2050, customerId: 'cu2', customerName: 'Anand Packaging Pvt Ltd', contactName: 'Ritu Shah', phone: '+919898000444', priority: 1,
      address: 'Plot 88, Kalol Industrial Estate', city: 'Kalol', serialNumber: 'CNX7788991', model: 'Canon iR2206N', issue: 'Hardware failure',
      description: 'Copier makes a grinding noise and jams every few pages.', createdAt: ago(190) }),
    mkTicket({ id: 'k2049', ticketNo: 2049, customerId: 'cu1', customerName: 'Shree Ganesh Traders', contactName: 'Mehul Patel', phone: '+919825000222', priority: 3,
      address: '12, GIDC Sector 25', city: 'Gandhinagar', serialNumber: 'VNB3K12345', model: 'HP LaserJet Pro M126nw', issue: 'Print quality',
      description: 'Prints are blurry after the toner change.', createdAt: ago(1500) }),
    mkTicket({ id: 'k2041', ticketNo: 2041, customerId: 'cu1', customerName: 'Shree Ganesh Traders', contactName: 'Mehul Patel', phone: '+919825000222', priority: 1,
      address: '12, GIDC Sector 25', city: 'Gandhinagar', serialNumber: 'VNB3K12345', model: 'HP LaserJet Pro M126nw', issue: 'Paper jam',
      description: 'Printer pulls multiple sheets and shows a paper jam error.', createdAt: ago(300), status: 'ASSIGNED', visitStatus: 'SCHEDULED', ...ravi }),
    mkTicket({ id: 'k2043', ticketNo: 2043, customerId: 'cu2', customerName: 'Anand Packaging Pvt Ltd', contactName: 'Ritu Shah', phone: '+919898000444',
      address: 'Plot 88, Kalol Industrial Estate', city: 'Kalol', serialNumber: 'CNX7788991', model: 'Canon iR2206N', issue: 'Print quality',
      description: 'Prints come out with faded streaks.', createdAt: ago(280), status: 'ASSIGNED', visitStatus: 'SCHEDULED', ...ravi }),
    mkTicket({ id: 'k2044', ticketNo: 2044, customerId: 'cu3', customerName: 'Dr. Desai Clinic', contactName: 'Reception', phone: '+919712000555',
      address: 'Shop 4, Sector 7 Market', city: 'Gandhinagar', serialNumber: 'X4RT221877', model: 'Epson L3250', issue: 'Network / connectivity',
      description: 'Printer not detected on the network after a power cut.', createdAt: ago(260), status: 'IN_PROGRESS', visitStatus: 'CHECKED_IN', ...ravi }),
    mkTicket({ id: 'k2045', ticketNo: 2045, customerId: 'cu3', customerName: 'Dr. Desai Clinic', contactName: 'Reception', phone: '+919712000555', priority: 3,
      address: 'Shop 4, Sector 7 Market', city: 'Gandhinagar', serialNumber: 'X4RT221877', model: 'Epson L3250', issue: 'Consumables',
      description: 'Low ink warning and light prints.', createdAt: ago(240), status: 'ASSIGNED', visitStatus: 'SCHEDULED', ...kiran }),
    mkTicket({ id: 'k2038', ticketNo: 2038, customerId: 'cu4', customerName: 'Kalpana Stationers', contactName: 'Kalpana Joshi', phone: '+919909000666', priority: 3,
      address: '21, Infocity Road', city: 'Gandhinagar', serialNumber: 'U63877H5J123', model: 'Brother HL-L2351DW', issue: 'Consumables',
      description: 'Toner replacement requested.', createdAt: ago(1800), status: 'SOLVED', solvedAt: ago(120), visitStatus: 'COMPLETED', warrantyStatus: 'VOID',
      workDone: 'Replaced toner cartridge and cleaned the pickup roller.', parts: [{ description: 'Toner cartridge (black)', quantity: 1, warrantyWaived: false, unitPricePaise: 275000 }], ...ravi }),
    mkTicket({ id: 'k2037', ticketNo: 2037, customerId: 'cu2', customerName: 'Anand Packaging Pvt Ltd', contactName: 'Ritu Shah', phone: '+919898000444',
      address: 'Plot 88, Kalol Industrial Estate', city: 'Kalol', serialNumber: 'CNX7788991', model: 'Canon iR2206N', issue: 'Print quality',
      description: 'Faded vertical streaks on every page.', createdAt: ago(2900), status: 'SOLVED', solvedAt: ago(1300), visitStatus: 'COMPLETED', warrantyStatus: 'EXPIRED',
      workDone: 'Replaced the fuser assembly and ran a calibration.', parts: [{ description: 'Fuser assembly', quantity: 1, warrantyWaived: false, unitPricePaise: 540000 }], ...kiran }),
    mkTicket({ id: 'k2030', ticketNo: 2030, customerId: 'cu1', customerName: 'Shree Ganesh Traders', contactName: 'Mehul Patel', phone: '+919825000222',
      address: '12, GIDC Sector 25', city: 'Gandhinagar', serialNumber: 'VNB3K12345', model: 'HP LaserJet Pro M126nw', issue: 'Paper jam',
      description: 'Paper keeps jamming at the tray.', createdAt: ago(5800), status: 'SOLVED', solvedAt: ago(4300), visitStatus: 'COMPLETED', warrantyStatus: 'IN_WARRANTY',
      workDone: 'Replaced the pickup roller and tested 30 pages.', parts: [{ description: 'Paper pickup roller', quantity: 1, warrantyWaived: true, unitPricePaise: 85000 }],
      invoice: { id: 'inv0', invoiceNo: 'BPP/2026-27/000001', totalPaise: 0 }, ...ravi }),
  ];
}
let ticketsCache: Ticket[] | null = null;
const getTickets = () => (ticketsCache ??= buildTickets());
let nextTicketNo = 2053;
let nextInvoiceNo = 2;

const findTicket = (id: string) => {
  const t = getTickets().find((x) => x.id === id);
  if (!t) throw new Error('Ticket not found');
  return t;
};

function mockInvoice(ticket: Ticket, extraIds: string[]): InvoicePreview {
  const inWarranty = ticket.warrantyStatus === 'IN_WARRANTY';
  const lines: InvoiceLine[] = [
    ...(ticket.parts ?? []).map((p) => ({
      description: p.description, quantity: p.quantity, unitPricePaise: p.unitPricePaise, gstRateBp: 1800,
      warrantyWaived: p.warrantyWaived, lineTotalPaise: p.warrantyWaived ? 0 : p.unitPricePaise * p.quantity,
    })),
    ...extraIds.map((id) => {
      const c = catalog.find((x) => x.id === id)!;
      const waived = inWarranty && c.warrantyCovers;
      return { description: c.name, quantity: 1, unitPricePaise: c.unitPricePaise ?? 0, gstRateBp: 1800, warrantyWaived: waived, lineTotalPaise: waived ? 0 : c.unitPricePaise ?? 0 };
    }),
  ];
  const subtotalPaise = lines.reduce((s, l) => s + l.lineTotalPaise, 0);
  const tax = lines.reduce((s, l) => s + Math.round((l.lineTotalPaise * l.gstRateBp) / 10_000), 0);
  const cgstPaise = Math.floor(tax / 2);
  return { lines, subtotalPaise, cgstPaise, sgstPaise: tax - cgstPaise, igstPaise: 0, totalPaise: subtotalPaise + tax };
}

export const mockApi = {
  // ───────── technician ─────────
  getMyVisits: () =>
    delay(getVisits().map((v) => ({ ...v })).sort((a, b) => Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED') || a.priority - b.priority)),

  getVisit: async (id: string) => {
    const v = getVisits().find((x) => x.id === id);
    if (!v) throw new Error('Visit not found');
    return delay({ ...v });
  },

  getVisitWarranty: async (id: string) => {
    const v = getVisits().find((x) => x.id === id);
    if (!v) throw new Error('Visit not found');
    return delay(v.assetId ? warranties[v.assetId] ?? null : null, 700);
  },

  checkIn: async (id: string) => {
    const v = getVisits().find((x) => x.id === id);
    if (!v || v.status !== 'SCHEDULED') throw new Error('Visit is not in SCHEDULED state');
    v.status = 'CHECKED_IN';
    const t = getTickets().find((x) => x.ticketNo === v.jobNo);
    if (t) { t.status = 'IN_PROGRESS'; t.visitStatus = 'CHECKED_IN'; }
    return delay({ ok: true });
  },

  // The technician screens never display prices (the real API does not even send them).
  getCatalog: (types: string) =>
    delay(catalog.filter((c) => types.split(',').includes(c.type)).map((c) => ({ ...c }))),
  getIssueCategories: () => delay(categories.map((c) => ({ ...c })), 200),

  solveVisit: async (id: string, payload: SolvePayload): Promise<SolveResult> => {
    const v = getVisits().find((x) => x.id === id);
    if (!v) throw new Error('Visit not found');
    if (v.status !== 'CHECKED_IN') throw new Error(`Check in at the site first (current status: ${v.status})`);
    const warranty = v.assetId ? warranties[v.assetId] ?? null : null;
    const parts = payload.parts.map((p) => {
      const c = catalog.find((x) => x.id === p.catalogItemId)!;
      return { description: c.name, quantity: p.quantity, warrantyWaived: !!warranty && !warranty.billable && c.warrantyCovers, unitPricePaise: c.unitPricePaise ?? 0 };
    });
    v.status = 'COMPLETED';
    v.workDone = payload.workDone;
    v.parts = parts.map(({ description, quantity, warrantyWaived }) => ({ description, quantity, warrantyWaived }));
    const t = getTickets().find((x) => x.ticketNo === v.jobNo);
    if (t) {
      t.status = 'SOLVED'; t.visitStatus = 'COMPLETED'; t.solvedAt = new Date().toISOString(); t.workDone = payload.workDone;
      t.parts = parts; t.warrantyStatus = warranty?.status ?? 'NOT_APPLICABLE';
    }
    return delay({ ticketNo: v.jobNo, warranty }, 800);
  },

  // ───────── public form ─────────
  submitTicket: async (p: NewTicketPayload) => {
    const ticketNo = nextTicketNo++;
    getTickets().unshift(mkTicket({
      id: `k${ticketNo}`, ticketNo, customerId: `cu-new-${ticketNo}`, customerName: p.company?.trim() || p.name, contactName: p.name, phone: p.phone,
      address: p.address, city: p.city ?? null, serialNumber: p.serialNumber, serialRecognised: false,
      issue: categories.find((c) => c.id === p.issueCategoryId)?.name ?? null, description: p.description, createdAt: new Date().toISOString(),
    }));
    return delay({ ticketNo }, 700);
  },

  // ───────── admin ─────────
  getTickets: async (f: { status?: TicketStatus[]; uninvoiced?: boolean; q?: string }) => {
    const q = f.q?.trim().toLowerCase();
    return delay(
      getTickets()
        .filter((t) => !f.status?.length || f.status.includes(t.status))
        .filter((t) => !f.uninvoiced || t.status !== 'SOLVED' || !t.invoice)
        .filter((t) => !q || t.customerName.toLowerCase().includes(q) || (t.serialNumber ?? '').toLowerCase().includes(q) || String(t.ticketNo) === q)
        .map((t) => ({ ...t, parts: undefined }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      350,
    );
  },

  getTicket: async (id: string) => delay({ ...findTicket(id) }, 250),

  assignTicket: async (id: string, body: AssignRequest) => {
    const t = findTicket(id);
    if (t.status !== 'NEW' && t.status !== 'ASSIGNED') throw new Error(`Ticket is ${t.status}; it can no longer be (re)assigned`);
    const tech = TECHS.find((x) => x.id === body.technicianId);
    if (!tech) throw new Error('Choose an active technician');
    t.status = 'ASSIGNED'; t.visitStatus = 'SCHEDULED'; t.technicianId = tech.id; t.technicianName = tech.name;
    if (body.priority) t.priority = body.priority;
    const visits = getVisits();
    const existing = visits.find((v) => v.jobNo === t.ticketNo);
    if (tech.id === 't1' && !existing) {
      visits.push({
        id: `v-${t.ticketNo}`, jobNo: t.ticketNo, status: 'SCHEDULED', scheduledFor: new Date().toISOString(),
        customerName: t.customerName, customerPhone: t.phone, siteLabel: 'Customer site', address: t.address, city: t.city,
        latitude: null, longitude: null, contactName: t.contactName, contactPhone: t.phone, description: t.description, issue: t.issue,
        priority: t.priority, assetId: null, assetModel: t.model, serialNumber: t.serialNumber, serialRecognised: t.serialRecognised,
      });
    } else if (existing && tech.id !== 't1') {
      visits.splice(visits.indexOf(existing), 1);
    }
    return delay({ ok: true }, 300);
  },

  cancelTicket: async (id: string) => {
    const t = findTicket(id);
    if (t.status !== 'NEW' && t.status !== 'ASSIGNED') throw new Error(`Ticket is ${t.status}; it cannot be cancelled`);
    t.status = 'CANCELLED';
    return delay({ ok: true }, 250);
  },

  getTechnicianReport: async (): Promise<TechnicianStats[]> =>
    delay(TECHS.map((tech) => {
      const mine = getTickets().filter((t) => t.technicianId === tech.id);
      const solved = mine.filter((t) => t.status === 'SOLVED');
      return {
        id: tech.id, name: tech.name,
        activeTickets: mine.filter((t) => t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS').length,
        totalVisits: mine.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'SOLVED').length + 14, // + earlier history
        solvedTickets: solved.length + 12,
        lastSolvedAt: solved.map((t) => t.solvedAt ?? '').sort().pop() || null,
      };
    }), 300),

  getCustomerReport: async (q: string): Promise<CustomerStats[]> => {
    const groups = new Map<string, Ticket[]>();
    for (const t of getTickets()) groups.set(t.customerId, [...(groups.get(t.customerId) ?? []), t]);
    const needle = q.trim().toLowerCase();
    return delay([...groups.entries()]
      .map(([id, ts]) => ({
        id, name: ts[0].customerName, phone: ts[0].phone,
        ticketsRaised: ts.length,
        ticketsSolved: ts.filter((t) => t.status === 'SOLVED').length,
        ticketsOpen: ts.filter((t) => ['NEW', 'ASSIGNED', 'IN_PROGRESS'].includes(t.status)).length,
        lastTicketAt: ts.map((t) => t.createdAt).sort().pop() ?? null,
      }))
      .filter((c) => !needle || c.name.toLowerCase().includes(needle))
      .sort((a, b) => b.ticketsRaised - a.ticketsRaised || a.name.localeCompare(b.name)), 300);
  },

  getCustomerTickets: async (customerId: string) =>
    delay(getTickets().filter((t) => t.customerId === customerId).map((t) => ({ ...t, parts: undefined })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), 250),

  previewInvoice: async (body: InvoiceRequest) => {
    const t = findTicket(body.ticketId);
    if (t.status !== 'SOLVED') throw new Error('Only solved tickets can be invoiced');
    return delay(mockInvoice(t, body.extraItems.map((e) => e.catalogItemId)), 200);
  },

  createInvoice: async (body: InvoiceRequest) => {
    const t = findTicket(body.ticketId);
    if (t.status !== 'SOLVED') throw new Error('Only solved tickets can be invoiced');
    if (t.invoice) throw new Error(`Already invoiced as ${t.invoice.invoiceNo}`);
    const preview = mockInvoice(t, body.extraItems.map((e) => e.catalogItemId));
    const invoice: InvoiceSummary = { id: `inv${nextInvoiceNo}`, invoiceNo: `BPP/2026-27/${String(nextInvoiceNo++).padStart(6, '0')}`, totalPaise: preview.totalPaise };
    t.invoice = invoice;
    return delay({ invoice, ...preview }, 600);
  },
};
