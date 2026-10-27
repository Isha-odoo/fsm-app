# Bhawani Print and Pack — Field Service Management (FSM)

## 0. Current workflow: break-fix tickets (supersedes the quotation flow below)

```
Customer form (public) -> Ticket NEW -> Admin assigns technician -> Technician checks in -> Technician marks SOLVED (work, parts, warranty snapshot) -> Admin creates GST invoice
```

- **Ticket = `service_jobs` row** (`job_no` is the ticket number). Status: `NEW`, `ASSIGNED`, `IN_PROGRESS`, `SOLVED`, `CANCELLED`. "Invoiced" is derived from the invoice that links to the solving visit.
- **Assigning** creates the technician's `visits` row (re-assignable until check-in). A partial unique index allows only one open visit per ticket.
- **Solving + quotation** (`POST /visits/:id/solve`, idempotent): the technician sends the solution and the items used (parts, consumables, services). The server prices them from the catalog, decides warranty-waived lines from the machine's warranty, stores them in `visit_parts` with their GST rate, snapshots the warranty on the visit, deducts stock for physical items, and creates the `quotations` row (number `BPP-QT-…`, frozen totals, status SHARED) plus a customer share link. `POST /visits/:id/solve/preview` gives the same pricing live, without saving. Technicians cannot override warranty.
- **Customer's copy** (`/q/<token>`, public): the token is random, only its SHA-256 is stored (`quotation_share_links`), links expire after 60 days. The customer can print it and approve or decline (`quotations.status`, rate-limited). Staff can also record the answer.
- **Invoicing** (`POST /invoices`, admin only) builds lines from the same `visit_parts` (the rates and prices the customer saw) plus optional extra catalog services the admin adds, links the quotation (`invoices.quotation_id`), applies GST per line (CGST+SGST for the seller's state, else IGST), numbers it `BPP/<FY>/<6 digits>` from `invoice_counters` inside the same transaction. One invoice per visit.
- **Public intake** (`POST /api/public/tickets`, no login): zod validation, 10 requests/hour/IP, honeypot field, `Idempotency-Key`. Serial matches a machine => ticket inherits its customer, site and warranty; otherwise the customer is found/created by phone and the typed serial is kept for the admin to verify. The response only contains the ticket number.
- **Reports**: views `v_technician_stats` (active tickets, visits = check-ins, solved) and `v_customer_ticket_stats` (raised, solved, open).

| Endpoint | Role |
|---|---|
| `GET /public/issue-categories`, `POST /public/tickets` | public |
| `GET /tickets`, `GET /tickets/:id`, `POST /tickets/:id/assign`, `POST /tickets/:id/cancel` | admin, dispatcher |
| `GET /reports/tickets`, `GET /reports/technicians`, `GET /reports/customers` | admin, dispatcher |
| `GET /inventory/items` | admin, dispatcher |
| `POST /inventory/items`, `PATCH /inventory/items/:id`, `POST /inventory/items/:id/stock` | admin |
| `GET /users`, `POST /users`, `PATCH /users/:id` | admin |
| `GET /public/catalog`, `GET /public/quotations/:token`, `POST /public/quotations/:token/decision` | public |
| `GET /quotations`, `POST /quotations/:id/decision` | admin, dispatcher |
| `GET /quotations/:id`, `POST /quotations/:id/share-link` | admin, dispatcher, the technician who made it |
| `GET /invoices`, `GET /invoices/:id` | admin |
| `POST /visits/:id/solve/preview` | technician (own visits) |
| `POST /invoices/preview`, `POST /invoices` | admin |
| `GET /visits/me`, `GET /visits/:id`, `GET /visits/:id/warranty`, `POST /visits/:id/check-in`, `POST /visits/:id/solve` | technician (own visits only) |

Frontend routes: `/request` (public), `/login`, `/admin/dispatch`, `/admin/reports`, `/admin/inventory`, `/admin/employees`, `/admin/quotations[/:id]`, `/admin/invoices[/:id]`, `/admin/tickets/:id`, `/q/:token` (customer), `/` and `/visits/:id[/solve]` (technician).

**Roles and employees.** `users.role` is ADMIN, DISPATCHER or TECHNICIAN. Admins create and disable logins (`/api/users`); you cannot demote or disable yourself, or disable a technician who still has open tickets. Technician endpoints are filtered by the signed-in user's id (another technician's visit returns 404).

**Inventory.** Products (machine models), services, spare parts and consumables are all `catalog_items`. `requestable` decides whether a product or service is offered on the public form. Stock is a ledger, `stock_moves` (opening, purchase, adjustment, used on ticket); on-hand is the sum. Solving a ticket deducts the parts used (it may go negative, so a technician in the field is never blocked; the admin sees it in red). A ticket stores `product_id` (the machine's model when the serial matched, otherwise the customer's choice) and `service_id`; the technician's `work_done` is the recorded solution.

**Reports.** `GET /reports/tickets` takes `from, to, customerId, technicianId, productId, serviceId, status, q` and returns rows, totals and a day-wise summary; `/reports/technicians` and `/reports/customers` take the same date range. Dates are IST calendar days. Visits record `assigned_by` and `assigned_at`.

**Mobile app.** The technician screens are a PWA (manifest + icons) that can be wrapped as an APK with Bubblewrap (TWA) or Capacitor; see the README.

Sections 2 to 7 below were written for the earlier quotation flow. Where they mention technicians creating quotations or invoices, this section wins.

## 1. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (React + TypeScript)** as a **PWA** | One codebase for the admin dashboard and the technicians' phones; installable, works with spotty mobile data |
| UI | Tailwind + shadcn/ui, TanStack Query, Leaflet + OpenStreetMap | Fast to build, no per-map-load fees (Google Maps is optional) |
| Backend | **Node.js + TypeScript (Express or Fastify)**, zod for validation | Same language as the frontend; the starter code here uses Express |
| Database | **PostgreSQL 15+** | Relational data, transactions for billing, trigram search, views for metrics |
| Queue | Redis + BullMQ | PDF rendering, email, WhatsApp/SMS sending kept off the request path |
| PDF | Puppeteer (HTML to PDF) or `pdf-lib` | GST-style invoice layout |
| Storage | S3-compatible private bucket (AWS S3 Mumbai, Cloudflare R2) | Invoice PDFs, job photos; accessed only via signed URLs |
| Email | AWS SES / Resend | Invoice delivery |
| Auth | JWT access token (15 min) + rotating refresh token in an httpOnly cookie; argon2id password hashes | |
| Hosting | One VPS or managed container service in an India region, managed Postgres with daily backups | Right-sized for a small team; scales up later without a rewrite |

Optional later: native app wrapper (Capacitor) if you need better background GPS.

## 2. Architecture

```
 Technician phone (PWA) ─┐
                         ├─ HTTPS ─> API (Node/TS) ─┬─> PostgreSQL
 Admin browser ──────────┘                          ├─> Redis/BullMQ ─> Worker: PDF, email, WhatsApp link
                                                    └─> Object storage (PDFs, photos)
```

Key design decisions:

- **Visit-centric model.** A `service_job` is the customer's request; a `visit` is one technician trip. A job can need several visits (return for parts), which keeps visit counts and history accurate.
- **Warranty is evaluated on the server** at completion time and the decision is **snapshotted** on the visit (status, end date, any override). Later edits to the asset cannot rewrite past billing.
- **Technicians issue quotations, admins issue invoices.** Completing a visit creates a quotation (`BPP-QT-1001`, plain sequence; statuses Draft, Shared, Approved, Rejected, see `db/002_quotations.sql`). The final GST invoice, with strict numbering and CGST/SGST/IGST, is created later by an admin from an approved quotation.
- **Prices come from the catalog, not the client.** The quotation stores a price snapshot per line; quotation totals exclude GST.
- **Money is integer paise.**
- **Offline tolerance:** the PWA queues the completion request and retries with the same `Idempotency-Key`, so a dropped connection never creates a duplicate invoice.

## 3. Database

Full DDL is in `db/001_schema.sql`. Summary:

| Table | Purpose |
|---|---|
| `users` | Admin / dispatcher / technician accounts |
| `customers`, `customer_sites` | Customer and their locations (GST state code, lat/lng) |
| `catalog_items` | Products, parts, consumables, services; price, GST rate, default warranty, `warranty_covers` flag |
| `assets` | Each serial-numbered machine: customer, site, model, serial, warranty start/term/void |
| `warranty_extensions` | AMC or goodwill extensions, kept as history |
| `issue_categories` | Controlled list of fault types (needed for recurring-issue detection) |
| `service_jobs` | Customer request (status, priority, asset, issue) |
| `visits` | Technician trip: schedule, GPS check-in, completion, warranty snapshot |
| `location_pings` | Breadcrumb trail for live and historical tracking |
| `quotations`, `quotation_items`, `quotation_share_links` | On-site quotes from technicians; `BPP-QT-` sequence from 1001; hashed, expiring customer links |
| `invoices`, `invoice_items`, `payments` | Final GST invoices, created by admins only (optionally from a quotation); gapless numbering per financial year via `invoice_counters` |
| `invoice_share_links` | Hashed, expiring tokens for customer access to the PDF |
| `audit_log` | Who did what: invoice creation, warranty overrides, etc. |

Relationships: customer 1–N sites, 1–N assets; asset 1–N jobs; job 1–N visits; visit 1–1 invoice; invoice 1–N items and payments.

**Warranty logic:** `end = start + (warranty_months + extensions) months - 1 day`, inclusive. Status is one of `IN_WARRANTY`, `EXPIRED`, `VOID`, `NO_RECORD`. Consumables and items with `warranty_covers = false` stay billable even in warranty. See `warranty.service.ts`.

**CRM metrics** are SQL views: `v_customer_visit_stats` (total visits, first and last visit, average per month), `v_customer_visits_by_month`, `v_recurring_issues` (same asset and fault category 2+ times in 180 days).

**Search:** `pg_trgm` indexes on customer name and serial number give fast partial and typo-tolerant matches. Date, technician and warranty filters are plain indexed columns.

## 4. API endpoints (REST, all under `/api`, JWT required)

**Auth:** `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`

**Customers and sites:** `GET /customers?q=`, `POST /customers`, `GET /customers/:id` (profile with metrics), `PATCH /customers/:id`, `GET /customers/:id/assets`, `GET /customers/:id/visits`, `POST /customers/:id/sites`

**Assets:** `GET /assets?serial=&customerId=`, `POST /assets`, `GET /assets/:id` (details + service history + warranty status), `POST /assets/:id/warranty-extensions`, `POST /assets/:id/void-warranty` (admin)

**Catalog:** `GET /catalog?type=`, `POST /catalog`, `PATCH /catalog/:id` (admin)

**Jobs and dispatch:** `POST /jobs`, `GET /jobs?status=&from=&to=&technicianId=&warranty=`, `GET /jobs/:id`, `POST /jobs/:id/assign` (creates a visit with `technicianId`, `scheduledFor`), `POST /jobs/:id/cancel`

**Visits (technician flow):** `GET /visits/me?date=`, `GET /visits/:id`, `POST /visits/:id/check-in` (lat/lng), `GET /visits/:id/warranty`, **`POST /visits/:id/complete`** (work done + parts, creates a **quotation**; `shareNow` makes it Shared instead of Draft), `POST /visits/:id/photos`

**Quotations:** `PATCH /quotations/:id/status` (Draft to Shared by the owner or staff; Shared to Approved/Rejected by staff), `GET /catalog`, `GET /catalog/issue-categories`

**Tracking:** `POST /tracking/pings` (batch of GPS points from the PWA), `GET /tracking/live` (latest position per technician), `GET /tracking/history?technicianId=&date=` (route and visits for that day)

**Invoices:** `GET /invoices?q=&from=&to=&status=`, `GET /invoices/:id`, `POST /invoices/:id/resend` (email/WhatsApp), `POST /invoices/:id/payments`, `POST /invoices/:id/void` (admin, reason required), public `GET /i/:token` (customer PDF view via share link)

**Search and reports:** `GET /search?q=&from=&to=&technicianId=&warranty=&serial=` (global search across customers, assets, jobs, invoices), `GET /reports/recurring-issues`, `GET /reports/technician-productivity`, `GET /reports/warranty-expiring?days=60`

## 5. UI layout

**Admin / dispatcher dashboard (desktop):**
- Left sidebar: Dashboard, Jobs, Dispatch map, Customers, Assets, Invoices, Reports, Settings.
- Top bar: global search box (customer, serial, invoice no.) with filter chips for date range, technician and warranty status.
- Dashboard cards: open jobs, jobs today, in-warranty vs billable calls this month, revenue this month, warranties expiring in 60 days.
- Main area split in two: a **live map** of technicians (pin per technician with current visit) and a **job board** with columns New, Assigned, In progress, Completed, with drag-to-assign.
- Customer profile page: header with contact and sites; tabs for Assets (each with a warranty badge), Service history timeline, Invoices, Metrics (total visits, visits per month chart, recurring-issue list).

**Technician mobile view (PWA, single column, large tap targets):**
- Home: today's visits as cards (customer, address, time, issue) with Navigate and Call buttons.
- Visit screen: check-in button (captures GPS), a colour-coded **warranty banner** from the scanned or typed serial number (green In warranty until..., red Expired, grey No record), fault category, work-done notes, photos.
- Parts and charges: pick items from the catalog; waived lines show Rs 0 with a "Warranty" tag; running total with GST.
- Finish: collect payment (cash/UPI), generate invoice, then share via WhatsApp, email or show a QR for the PDF link. Works offline and syncs when the connection returns.

## 6. Security checklist for billing data

- Role-based access (technician sees only their visits; only admin can void invoices or override warranty); enforce on the server, not just in the UI.
- Parameterised SQL everywhere; zod validation on every input; rate limiting on login and public share links.
- argon2id hashing, short-lived JWTs, refresh-token rotation, httpOnly + Secure + SameSite cookies, CSRF protection if cookies are used for auth.
- TLS everywhere; encryption at rest for the database and bucket; private bucket with short-lived signed URLs; share-link tokens are random, hashed at rest, and expire.
- Invoices are never edited after issue: corrections are done by voiding and re-issuing or by credit notes; every change is in `audit_log`.
- Do not store card numbers. Use a payment gateway (Razorpay) or record only UPI/cash references.
- Daily encrypted backups with periodic restore tests; secrets in environment variables or a secrets manager, never in the repo.
- Collect only the customer data you need (India DPDP Act).
- Have a GST-compliant invoice format reviewed by your accountant (and e-invoicing if your turnover requires it).

## 7. Suggested build order

1. Auth, customers, sites, catalog, assets (with warranty fields)
2. Jobs, dispatch, technician PWA with check-in
3. **Visit completion and invoicing** (starter code provided), PDF and sharing
4. Search and CRM metrics, recurring-issue reports
5. Live tracking map and history
6. Reports, reminders for expiring warranties, payment gateway
