# Bhawani Print & Pack — Field Service Management

**Break-fix ticketing.** Customers raise a ticket on a public web form (no login). Admins assign it to a technician on the dispatch board. The technician visits, sees whether the machine is in warranty, fixes it, adds any parts or services used (warranty-covered ones are free) and marks the ticket **Solved**, which creates the customer's **quotation**. He shares it by WhatsApp or link; the customer can view, print and approve it. The admin sees everything on the ticket and issues the final GST **invoice**, which can be printed.

```
Customer form (/request) -> Ticket NEW -> Admin assigns -> Technician checks in -> Solves + quotation shared with customer -> Admin invoices and prints
```

| Who | Window | URL |
|---|---|---|
| Customer (public, no login) | Request form: product, service, serial, problem | `/request` (or `/request?serial=ABC123` to prefill the serial, handy for a QR sticker on each machine) |
| Administrator | Everything: dispatch, reports, inventory, employees, invoicing | `/admin/...` |
| Dispatcher | Dispatch board, reports, inventory (view only) | `/admin/...` |
| Technician (phone) | Only the tickets assigned to them | `/` |

Everybody signs in at `/login` with their own account and lands in their own window. Administrators create employee logins in **Admin > Employees**.

```
fsm/
├── frontend/          Next.js + Tailwind: technician app, admin dashboard, customer form
├── backend/           Node.js + Express + TypeScript API
├── db/                001_schema.sql, 002, 003_tickets, 004_inventory_reporting, 005_quotation_flow (PostgreSQL)
├── docker-compose.yml PostgreSQL for local development
└── ARCHITECTURE.md    Design, API list, UI layout, security notes
```

Requirements: **Node.js 20+** and **PostgreSQL 14+** (Docker is the easiest way). There is no demo/mock mode any more: logins, roles, stock and reports all need the real API.

---

## Run it

### 1. Start PostgreSQL

**With Docker** (from the `fsm` folder):

```bash
docker compose up -d db
```

The tables are created automatically on first start.

**Without Docker**: install PostgreSQL, then:

```bash
psql -U postgres -c "CREATE USER fsm WITH PASSWORD 'fsm_dev_password';"
psql -U postgres -c "CREATE DATABASE fsm OWNER fsm;"
psql -U postgres -d fsm -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS citext;"
psql -U fsm -d fsm -f db/001_schema.sql
psql -U fsm -d fsm -f db/002_quotations.sql
psql -U fsm -d fsm -f db/003_tickets.sql
psql -U fsm -d fsm -f db/004_inventory_reporting.sql
psql -U fsm -d fsm -f db/005_quotation_flow.sql
```

**Upgrading an existing database?** Apply only the files you have not run yet, in order (`003`, `004`, `005`). Both keep existing data: COMPLETED jobs become SOLVED, existing tickets get their product from the machine, and parts already used are copied into the stock ledger. With Docker, the files in `db/` only run when the data volume is first created; for an existing volume apply them with `docker compose exec -T db psql -U fsm -d fsm < db/004_inventory_reporting.sql`.

### 2. Start the API

```bash
cd backend
cp .env.example .env          # Windows: copy .env.example .env
npm install
npm run seed                  # demo users, inventory with stock, machines, assigned / new / solved tickets
npm run dev                   # API on http://localhost:4000
```

Edit `backend/.env` and set `JWT_SECRET` to a long random string (the command to generate one is in the file).

### 3. Start the web app

```bash
cd frontend
npm install
npm run dev                   # http://localhost:3000   (frontend/.env.local points at the API on :4000)
```

Open http://localhost:3000 and sign in:

| Role | Email | Password |
|---|---|---|
| Technician | `tech@bhawani.test` | `ChangeMe123!` |
| Technician | `tech2@bhawani.test` | `ChangeMe123!` |
| Admin | `admin@bhawani.test` | `ChangeMe123!` |

Change these before any real use.

Set your company name, address and GSTIN in `backend/.env` (`COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_GSTIN`, `COMPANY_PHONE`, `COMPANY_EMAIL`); they are printed on quotations and invoices. Add real employees in **Admin > Employees** (name, email, role, password; there is a Generate button), then retire the demo accounts.

### Try the flow
1. Open `/request` (no login). Pick a product and a service, enter a serial (`VNB3K12345` links to a known machine, any other is flagged "Serial not recognised") and submit.
2. Sign in as **admin** (or a dispatcher): the ticket is in *New tickets* on the **Dispatch board** (it refreshes every 30 seconds). Pick a technician and **Assign**; the card then shows who assigned it.
3. Sign in as that **technician** (another browser profile or the phone). Only their tickets are listed. **Check in at site**, then **Solve & create quotation**: the warranty card shows whether the machine is covered; write the solution; add parts, consumables or services (prices come from Inventory, covered items show "Free · warranty"); the totals with GST update live. Submit, then send the quotation by **WhatsApp**, the phone's share sheet, or copy the link.
4. The customer opens the link (`/q/...`, no login), reads the quotation, prints or saves it as PDF, and can **Approve** or **Decline**.
5. As admin, open the ticket (click its number anywhere): status bar, customer and machine, visit times, warranty, solution, quoted items, quotation status and the full history. **Create invoice** builds the invoice from the same lines, so it matches the quotation. **Invoices** and **Quotations** list everything; open one and use **Print / Save as PDF**.
6. **Reports**: filter by day (presets or custom dates), customer, technician, product, service and status; group by day, customer, employee, status, product or service; see the day-wise summary; export CSV. Click an employee or customer to jump to their tickets.
7. **Inventory**: products and services (tick "Offer on the customer request form" to show them to customers), spare parts and consumables with stock, low-stock alerts, receive stock or correct a count.

Cancel on a *New* ticket removes spam or duplicates (reason is audit-logged).

### What each role can do

| | Administrator | Dispatcher | Technician |
|---|---|---|---|
| Customer form | yes | yes | yes |
| Dispatch tickets | yes | yes | no |
| See all tickets and reports | yes | yes | no, own tickets only |
| Inventory | view and edit | view | no |
| Quotations | all, can record approval | all, can record approval | create their own, share, view own |
| Invoices (create, list, print) | yes | no | no |
| Employees and logins | yes | no | no |

The API enforces these rules on every request; hiding menu items is only a convenience.

### Turning the technician app into an APK

The technician screens are already a mobile-first web app and installable as one: `manifest.webmanifest` and icons are in place, so on Android Chrome you can **Add to home screen** today. To publish a real APK or Play Store app later, there are two routes, neither needs a rewrite:

1. **Trusted Web Activity (simplest).** Host the app on HTTPS, then run Google's Bubblewrap (`npx @bubblewrap/cli init --manifest https://your-domain/manifest.webmanifest`, then `build`). You get an APK/AAB that opens your site full screen. It needs a `/.well-known/assetlinks.json` file on your domain.
2. **Capacitor (if you want native features).** `npm i @capacitor/core @capacitor/cli @capacitor/android`, `npx cap init`, and point `server.url` at the hosted app. Add plugins later for background GPS, camera (photos of the repair) and push notifications.

Either way: serve the API over **HTTPS**, set `NEXT_PUBLIC_API_URL` to its public address, and add the app's origin to `CORS_ORIGIN` in `backend/.env` (for Capacitor that is `https://localhost`). Technician sign-in already works the same in a phone browser, so the APK needs no separate login system.

---

## If you see `{"error":"Not found"}` in the browser

That is the API (port 4000, or whatever `PORT` you set), which has no web pages; the API address now explains itself instead. Open the **web app** address (port 3000 by default). If you changed a port, make `frontend/.env.local` `NEXT_PUBLIC_API_URL` point at the API (for example `http://localhost:3001/api`) and `CORS_ORIGIN` in `backend/.env` match the address you open the web app on.

---

## What is and is not included

Included: public customer form (product, service, serial; rate-limited, honeypot, double-submit safe), per-employee logins with Administrator / Dispatcher / Technician roles and an Employees screen, dispatch board that records who assigned each ticket, technician app showing only their own tickets, server-side warranty check, parts logging with automatic stock deduction, inventory (products, services, parts, consumables, stock ledger, low-stock alerts), technicians create warranty-aware quotations on site and share them with the customer (public link with approve / decline), admin invoicing from the quotation with CGST/SGST/IGST and gapless numbering per financial year, printable A4 quotation and tax invoice (with amount in words), Odoo-style ticket view with full history, quotation and invoice lists, filterable reports (day, customer, employee, product, service, status, group-by, CSV), audit log, installable web app, unit tests (`cd backend && npm test`).

Behaviour worth knowing:
- A customer's serial is matched exactly (case-insensitive) to a machine on file. On a match the ticket uses that machine's customer, site and warranty. On no match a customer is found by phone number (or created) and the admin sees a "Serial not recognised" badge. The technician then gets no warranty record and the office verifies it.
- New customers created from the form get GST state code `24` (`SELLER_STATE_CODE`). Correct it on the site record before invoicing an out-of-state customer, otherwise CGST+SGST is charged instead of IGST.
- Technicians never receive prices: the catalog endpoint omits them, and they cannot list services.
- Quotation lines live in `visit_parts` (with the GST rate they were quoted at) and the `quotations` table holds the number, status and frozen totals, so the quotation, the customer's copy and the invoice always agree. Tickets solved before this feature have no quotation; they can still be invoiced.
- Printing uses the browser (**Print / Save as PDF**), laid out for A4. A server-generated PDF to email automatically is not built.
- The customer link is a random token (only its hash is stored) and expires after 60 days; anyone holding it can view and answer the quotation.

Not built yet:
- **Automatic emailing of invoices and server-side PDF files** (the technician already shares quotations by WhatsApp and link). `backend/src/queue.ts` is a stub that logs jobs (including `ticket.created`, a good hook for notifying the office); swap in BullMQ + a worker.
- **Linking an unrecognised serial to a machine, warranty overrides, machine/asset register screens, a customer ticket-tracking page and live tracking map** in the admin UI.
- **Production hardening:** the demo keeps the login token in `localStorage` for 12 hours. Use short-lived tokens with refresh cookies, HTTPS, backups and a reviewed GST invoice format. Behind a reverse proxy set `TRUST_PROXY=1` so the public form's rate limit sees real client IPs, and consider a CAPTCHA if spam appears.
