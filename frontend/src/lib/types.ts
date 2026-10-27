export type VisitStatus = 'SCHEDULED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED';
export type WarrantyStatus = 'IN_WARRANTY' | 'EXPIRED' | 'VOID' | 'NO_RECORD';
export type TicketStatus = 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'SOLVED' | 'CANCELLED';
export type ItemType = 'PRODUCT' | 'PART' | 'CONSUMABLE' | 'SERVICE';
export type Role = 'ADMIN' | 'DISPATCHER' | 'TECHNICIAN';

// ───────── technician app ─────────
export type QuoteStatus = 'DRAFT' | 'SHARED' | 'APPROVED' | 'REJECTED';

/** A line quoted to the customer (part, consumable or service). */
export interface PartUsed {
  description: string;
  quantity: number;
  warrantyWaived: boolean;     // free because the machine is in warranty
  unitPricePaise: number;
  gstRateBp: number;
  lineTotalPaise: number;
}

export interface QuotationRef {
  id: string;
  quotationNo: string;
  status: QuoteStatus;
  totalPaise: number;
}

/** One assigned ticket on a technician's phone. Technicians never receive prices. */
export interface Visit {
  id: string;
  jobNo: number;               // ticket number
  status: VisitStatus;
  scheduledFor: string | null; // when it was assigned / scheduled
  customerName: string;
  customerPhone: string | null;
  siteLabel: string;
  address: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  contactName: string | null;
  contactPhone: string | null;
  description: string | null;  // what the customer reported
  issue: string | null;        // issue category name
  service: string | null;      // service the customer asked for (repair, installation ...)
  priority: 1 | 2 | 3;         // 1 = urgent
  assetId: string | null;
  assetModel: string | null;   // the product (machine model) this ticket is about
  serialNumber: string | null; // serial as typed by the customer, or the machine's serial when matched
  serialRecognised: boolean;   // false => serial is not on file, so no warranty record can be found
  workDone?: string | null;
  parts?: PartUsed[];          // lines quoted, once solved
  quotation?: QuotationRef | null;
}

export interface Warranty {
  status: WarrantyStatus;
  startDate: string | null;
  endDate: string | null;
  daysRemaining: number | null;
  billable: boolean;
  reason: string;
}

export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  type: ItemType;
  warrantyCovers: boolean;
  unitPricePaise: number;
}

export interface IssueCategory {
  id: number;
  name: string;
}

export interface SolvePayload {
  workDone: string;            // the solution
  issueCategoryId?: number;
  items: { catalogItemId: string; quantity: number }[];  // parts, consumables and services used (may be empty)
}

/** Server-side pricing of the items, shown live while the technician builds the quotation. */
export interface QuoteLine {
  catalogItemId: string;
  type: 'PART' | 'CONSUMABLE' | 'SERVICE';
  description: string;
  hsnSac: string | null;
  quantity: number;
  unitPricePaise: number;
  gstRateBp: number;
  warrantyWaived: boolean;
  lineTotalPaise: number;
}

export interface QuotePreview {
  warranty: Warranty | null;
  lines: QuoteLine[];
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export interface SolveResult {
  ticketNo: number;
  warranty: Warranty | null;
  quotation: { id: string; quotationNo: string; totalPaise: number };
  shareUrl: string;            // link for the customer: /q/<token>
}

// ───────── public customer form ─────────
export interface NewTicketPayload {
  name: string;
  company?: string;
  phone: string;
  email?: string;
  serialNumber: string;
  address: string;
  city?: string;
  productId?: string;   // inventory product (machine model)
  serviceId?: string;   // inventory service (repair, installation ...)
  issueCategoryId?: number;
  description: string;
  website?: string; // honeypot, always empty for real people
}

// ───────── admin dashboard ─────────
export interface TicketPart extends PartUsed {
  unitPricePaise: number;
}

export interface InvoiceSummary {
  id: string;
  invoiceNo: string;
  totalPaise: number;
}

export interface Ticket {
  id: string;
  ticketNo: number;
  status: TicketStatus;
  priority: 1 | 2 | 3;
  source: 'CUSTOMER' | 'ADMIN';
  createdAt: string;
  solvedAt: string | null;
  customerId: string;
  customerName: string;
  contactName: string | null;
  phone: string | null;
  address: string;
  city: string | null;
  serialNumber: string | null;
  serialRecognised: boolean;
  model: string | null;       // product
  productId: string | null;
  service: string | null;
  serviceId: string | null;
  issue: string | null;
  description: string | null;
  technicianId: string | null;
  technicianName: string | null;
  assignedByName: string | null;
  assignedAt: string | null;
  visitStatus: VisitStatus | null;
  warrantyStatus: WarrantyStatus | 'NOT_APPLICABLE' | null; // snapshot taken when the technician solved it
  workDone: string | null;    // the solution the technician recorded
  invoice: InvoiceSummary | null;
  quotation: QuotationRef | null;
  checkedInAt: string | null;
  completedAt: string | null;
  warrantyEnd: string | null;
  parts?: TicketPart[];          // only on the single-ticket endpoint
  activity?: ActivityEntry[];    // only on the single-ticket endpoint
}

export interface ActivityEntry {
  at: string;
  action: string;
  actor: string | null;
  detail: Record<string, unknown> | null;
}

export interface TechnicianStats {
  id: string;
  name: string;
  activeTickets: number;
  assigned: number;
  totalVisits: number;
  solvedTickets: number;
  lastSolvedAt: string | null;
}

export interface CustomerStats {
  id: string;
  name: string;
  phone: string | null;
  ticketsRaised: number;
  ticketsSolved: number;
  ticketsOpen: number;
  lastTicketAt: string | null;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPricePaise: number;
  gstRateBp: number;
  warrantyWaived: boolean;
  lineTotalPaise: number;
}

export interface InvoicePreview {
  lines: InvoiceLine[];
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export interface InvoiceRequest {
  ticketId: string;
  extraItems: { catalogItemId: string; quantity: number }[];
}

export interface AssignRequest {
  technicianId: string;
  priority?: 1 | 2 | 3;
}

// ───────── reports, employees, inventory ─────────
export interface ReportFilters {
  from?: string;          // YYYY-MM-DD (IST), inclusive
  to?: string;
  customerId?: string;
  technicianId?: string;
  productId?: string;
  serviceId?: string;
  status?: TicketStatus[];
  q?: string;
}

export interface DailyRow {
  day: string;
  raised: number;
  solved: number;
  open: number;
  cancelled: number;
}

export interface TicketReport {
  rows: Ticket[];
  truncated: boolean;
  summary: { raised: number; solved: number; open: number; cancelled: number };
  daily: DailyRow[];
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface NewEmployee {
  name: string;
  email: string;
  phone?: string;
  role: Role;
  password: string;
}

export interface EmployeeUpdate {
  name?: string;
  phone?: string | null;
  role?: Role;
  isActive?: boolean;
  password?: string;
}

export interface InventoryItem {
  id: string;
  type: ItemType;
  sku: string;
  name: string;
  hsnSac: string | null;
  unitPricePaise: number;
  gstRateBp: number;
  warrantyCovers: boolean;
  requestable: boolean;   // offered on the public request form
  isActive: boolean;
  reorderLevel: number;
  onHand: number | null;  // null for services
}

export interface InventoryInput {
  type: ItemType;
  sku: string;
  name: string;
  unitPricePaise: number;
  gstRateBp: number;
  hsnSac?: string | null;
  warrantyCovers: boolean;
  requestable: boolean;
  reorderLevel: number;
  openingStock?: number;
}

export interface PublicCatalog {
  products: { id: string; name: string }[];
  services: { id: string; name: string }[];
}

// ───────── printable documents (quotation and invoice) ─────────
export interface DocLine {
  description: string;
  hsnSac: string | null;
  quantity: number;
  unitPricePaise: number;
  gstRateBp: number;
  warrantyWaived: boolean;
  lineTotalPaise: number;
}

export interface DocumentData {
  kind: 'QUOTATION' | 'INVOICE';
  id?: string;                 // not present on the customer's public copy
  number: string;
  date: string;
  validUntil: string | null;
  status: string;
  quotationNo: string | null;  // on an invoice: the quotation it came from
  decision: { at: string; note: string | null } | null;
  seller: { name: string; address: string; gstin: string; phone: string; email: string; stateCode: string };
  customer: { name: string; contactName: string | null; phone: string | null; email: string | null; gstin: string | null; address: string; city: string | null; stateCode: string };
  ticket: { id?: string; ticketNo: number; product: string | null; serial: string | null; service: string | null; solution: string | null; technician: string | null; solvedAt: string | null };
  warranty: { status: string; endDate: string | null } | null;
  placeOfSupply: string;
  lines: DocLine[];
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  canDecide?: boolean;         // public copy only
}

export interface QuotationRow {
  id: string;
  quotationNo: string;
  status: QuoteStatus;
  createdAt: string;
  totalPaise: number;
  ticketId: string;
  ticketNo: number;
  customerName: string;
  technicianName: string | null;
  product: string | null;
  invoiceId: string | null;
  invoiceNo: string | null;
}

export interface InvoiceRow {
  id: string;
  invoiceNo: string;
  issuedAt: string;
  status: string;
  totalPaise: number;
  customerName: string;
  ticketNo: number;
  ticketId: string;
  quotationNo: string | null;
  issuedBy: string | null;
}
