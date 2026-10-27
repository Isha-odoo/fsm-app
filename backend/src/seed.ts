/**
 * Demo data: 1 admin, 2 technicians, a small catalog, 4 customers/machines, 4 tickets assigned to Ravi, 3 NEW customer
 * tickets waiting on the dispatch board, and 2 SOLVED tickets ready to invoice. Safe to run twice: it skips if already seeded.
 *   npm run seed
 */
import { addDays, addMonths, format, parseISO } from 'date-fns';
import { pool } from './db';
import { hashPassword } from './auth';
import { computeWarrantyEnd, todayIST } from './modules/warranty/warranty.service';
import { computeTax } from './modules/invoices/invoice.calc';

const DEMO_PASSWORD = 'ChangeMe123!';

async function main() {
  const client = await pool.connect();
  try {
    const existing = await client.query(`SELECT 1 FROM users WHERE email = 'admin@bhawani.test'`);
    if (existing.rows.length) { console.log('Already seeded. Nothing to do.'); return; }

    await client.query('BEGIN');
    const pw = await hashPassword(DEMO_PASSWORD);

    const admin = (await client.query(
      `INSERT INTO users (full_name, email, role, password_hash) VALUES ('Admin', 'admin@bhawani.test', 'ADMIN', $1) RETURNING id`, [pw])).rows[0].id;
    const tech = (await client.query(
      `INSERT INTO users (full_name, email, phone, role, password_hash) VALUES ('Ravi Technician', 'tech@bhawani.test', '+919800000001', 'TECHNICIAN', $1) RETURNING id`, [pw])).rows[0].id;

    const tech2 = (await client.query(
      `INSERT INTO users (full_name, email, phone, role, password_hash) VALUES ('Kiran Technician', 'tech2@bhawani.test', '+919800000002', 'TECHNICIAN', $1) RETURNING id`, [pw])).rows[0].id;

    // Issue categories
    const cats: Record<string, number> = {};
    for (const name of ['Paper jam', 'Print quality', 'Network / connectivity', 'Consumables', 'Hardware failure', 'Error code']) {
      cats[name] = (await client.query(`INSERT INTO issue_categories (name) VALUES ($1) RETURNING id`, [name])).rows[0].id;
    }

    // Catalog (prices in paise). Models are PRODUCT items; the rest are parts/services/consumables.
    // requestable = offered on the public request form. stock = opening quantity (services have none).
    const item = async (type: string, sku: string, name: string, price: number, covers: boolean,
                        o: { months?: number; requestable?: boolean; stock?: number; reorder?: number } = {}) => {
      const id = (await client.query(
        `INSERT INTO catalog_items (type, sku, name, hsn_sac, unit_price_paise, gst_rate_bp, default_warranty_months, warranty_covers, requestable, reorder_level)
         VALUES ($1::item_type, $2, $3, $4, $5, 1800, $6, $7, $8, $9) RETURNING id`,
        [type, sku, name, type === 'SERVICE' ? '998719' : '8443', price, o.months ?? null, covers, o.requestable ?? false, o.reorder ?? 0])).rows[0].id as string;
      if (o.stock) await client.query(`INSERT INTO stock_moves (item_id, qty_delta, reason, created_by) VALUES ($1, $2, 'OPENING', $3)`, [id, o.stock, admin]);
      return id;
    };

    await item('SERVICE', 'SVC-VISIT', 'Service visit charge', 50000, true);
    const svcRepair = await item('SERVICE', 'SVC-REPAIR', 'Repair / breakdown service', 75000, true, { requestable: true });
    await item('SERVICE', 'SVC-INSTALL', 'Installation & setup', 50000, false, { requestable: true });
    await item('SERVICE', 'SVC-PM', 'Preventive maintenance visit', 60000, false, { requestable: true });
    await item('SERVICE', 'SVC-REFILL', 'Toner / ink replacement', 30000, false, { requestable: true });
    const roller = await item('PART', 'PRT-ROLLER', 'Paper pickup roller', 85000, true, { stock: 20, reorder: 5 });
    const fuser = await item('PART', 'PRT-FUSER', 'Fuser assembly', 540000, true, { stock: 4, reorder: 5 });
    await item('PART', 'PRT-DRUM', 'Drum unit', 320000, true, { stock: 6, reorder: 2 });
    await item('PART', 'PRT-HEAD', 'Print head', 620000, true, { stock: 3, reorder: 2 });
    await item('PART', 'PRT-FORMATTER', 'Formatter / main board', 780000, true, { stock: 2, reorder: 1 });
    await item('CONSUMABLE', 'CON-TONER-BLK', 'Toner cartridge (black)', 275000, false, { stock: 12, reorder: 4 });
    await item('CONSUMABLE', 'CON-INK-SET', 'Ink bottle set (4 colours)', 120000, false, { stock: 15, reorder: 5 });

    const prod = { months: 12, requestable: true, stock: 3, reorder: 1 };
    const models = {
      hp: await item('PRODUCT', 'MOD-HP-M126NW', 'HP LaserJet Pro M126nw', 1450000, false, prod),
      canon: await item('PRODUCT', 'MOD-CANON-IR2206N', 'Canon iR2206N', 4200000, false, prod),
      epson: await item('PRODUCT', 'MOD-EPSON-L3250', 'Epson L3250', 1599900, false, prod),
      brother: await item('PRODUCT', 'MOD-BROTHER-L2351DW', 'Brother HL-L2351DW', 1199900, false, prod),
    };

    const today = todayIST();
    const monthsAgo = (m: number, extraDays = 0) => format(addDays(addMonths(parseISO(today), -m), extraDays), 'yyyy-MM-dd');

    // customer, site, model, serial, warranty start (null = no record), void?
    const setups = [
      { cust: 'Shree Ganesh Traders', site: 'Head office', addr: '12, GIDC Sector 25', city: 'Gandhinagar', lat: 23.2156, lng: 72.6369, contact: 'Mehul Patel', phone: '+919825000222', model: models.hp, serial: 'VNB3K12345', start: monthsAgo(7), isVoid: false, hour: 10, min: 0, status: 'SCHEDULED', cat: 'Paper jam', desc: 'Printer pulls multiple sheets and shows a paper jam error.', prio: 1 },
      { cust: 'Anand Packaging Pvt Ltd', site: 'Plant 2', addr: 'Plot 88, Kalol Industrial Estate', city: 'Kalol', lat: 23.2467, lng: 72.4951, contact: 'Ritu Shah', phone: '+919898000444', model: models.canon, serial: 'CNX7788991', start: monthsAgo(28), isVoid: false, hour: 12, min: 30, status: 'SCHEDULED', cat: 'Print quality', desc: 'Prints come out with faded streaks.', prio: 2 },
      { cust: 'Dr. Desai Clinic', site: 'Sector 7 Clinic', addr: 'Shop 4, Sector 7 Market', city: 'Gandhinagar', lat: 23.2223, lng: 72.6491, contact: 'Reception', phone: '+919712000555', model: models.epson, serial: 'X4RT221877', start: null, isVoid: false, hour: 15, min: 0, status: 'SCHEDULED', cat: 'Network / connectivity', desc: 'Printer not detected on the network after a power cut.', prio: 2 },
      { cust: 'Kalpana Stationers', site: 'Main shop', addr: '21, Infocity Road', city: 'Gandhinagar', lat: null, lng: null, contact: 'Kalpana Joshi', phone: '+919909000666', model: models.brother, serial: 'U63877H5J123', start: monthsAgo(4), isVoid: true, hour: 16, min: 30, status: 'SCHEDULED', cat: 'Consumables', desc: 'Toner replacement requested.', prio: 3 },
    ];

    const created: { customerId: string; siteId: string; assetId: string; model: string; contact: string; phone: string; start: string | null }[] = [];
    for (const s of setups) {
      const customerId = (await client.query(`INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id`, [s.cust, s.phone])).rows[0].id;
      const siteId = (await client.query(
        `INSERT INTO customer_sites (customer_id, label, address, city, state_code, latitude, longitude, contact_name, contact_phone)
         VALUES ($1,$2,$3,$4,'24',$5,$6,$7,$8) RETURNING id`,
        [customerId, s.site, s.addr, s.city, s.lat, s.lng, s.contact, s.phone])).rows[0].id;
      const assetId = (await client.query(
        `INSERT INTO assets (customer_id, site_id, model_id, serial_number, warranty_start, warranty_months, warranty_void, warranty_void_reason)
         VALUES ($1,$2,$3,$4,$5,12,$6,$7) RETURNING id`,
        [customerId, siteId, s.model, s.serial, s.start, s.isVoid, s.isVoid ? 'Liquid damage recorded' : null])).rows[0].id;
      created.push({ customerId, siteId, assetId, model: s.model, contact: s.contact, phone: s.phone, start: s.start });
      const jobId = (await client.query(
        `INSERT INTO service_jobs (customer_id, site_id, asset_id, issue_category_id, description, status, priority, created_by, product_id, service_id)
         VALUES ($1,$2,$3,$4,$5,'ASSIGNED',$6,$7,$8,$9) RETURNING id`,
        [customerId, siteId, assetId, cats[s.cat], s.desc, s.prio, admin, s.model, svcRepair])).rows[0].id;
      await client.query(
        `INSERT INTO visits (job_id, technician_id, scheduled_for, status, assigned_by, assigned_at)
         VALUES ($1,$2,($3::date + make_time($4,$5,0)) AT TIME ZONE 'Asia/Kolkata', 'SCHEDULED', $6, now() - interval '3 hours')`,
        [jobId, tech, today, s.hour, s.min, admin]);
    }

    // Two SOLVED tickets (no invoice yet) so the admin can try invoicing: one in warranty (part waived), one expired (billable).
    const solved = async (c: (typeof created)[number], techId: string, cat: string, desc: string, work: string, daysAgo: number,
                          wStatus: string, part: { id: string; name: string; price: number; waived: boolean }) => {
      const day = format(addDays(parseISO(today), -daysAgo), 'yyyy-MM-dd');
      const wEnd = c.start ? computeWarrantyEnd(c.start, 12) : null;
      const jobId = (await client.query(
        `INSERT INTO service_jobs (customer_id, site_id, asset_id, issue_category_id, description, status, priority, source, requester_name, requester_phone, created_at, solved_at, product_id, service_id)
         VALUES ($1,$2,$3,$4,$5,'SOLVED',2,'CUSTOMER',$6,$7, ($8::date + time '09:00') AT TIME ZONE 'Asia/Kolkata', ($8::date + time '14:00') AT TIME ZONE 'Asia/Kolkata', $9, $10) RETURNING id`,
        [c.customerId, c.siteId, c.assetId, cats[cat], desc, c.contact, c.phone, day, c.model, svcRepair])).rows[0].id;
      const visitId = (await client.query(
        `INSERT INTO visits (job_id, technician_id, scheduled_for, status, checked_in_at, completed_at, service_date, work_done, warranty_status, warranty_end_snapshot, assigned_by, assigned_at)
         VALUES ($1,$2,($6::date + time '11:00') AT TIME ZONE 'Asia/Kolkata','COMPLETED',($6::date + time '11:30') AT TIME ZONE 'Asia/Kolkata',
                 ($6::date + time '14:00') AT TIME ZONE 'Asia/Kolkata',$6::date,$3,$4::warranty_status,$5,$7, ($6::date + time '10:00') AT TIME ZONE 'Asia/Kolkata') RETURNING id`,
        [jobId, techId, work, wStatus, wEnd, day, admin])).rows[0].id;
      await client.query(
        `INSERT INTO visit_parts (visit_id, catalog_item_id, description, quantity, unit_price_paise, warranty_waived, gst_rate_bp, hsn_sac) VALUES ($1,$2,$3,1,$4,$5,1800,'8443')`,
        [visitId, part.id, part.name, part.price, part.waived]);
      // The quotation the technician created (and shared) when solving the ticket.
      const sub = part.waived ? 0 : part.price;
      const tax = computeTax([{ lineTotalPaise: sub, gstRateBp: 1800 }], true);
      await client.query(
        `INSERT INTO quotations (visit_id, customer_id, created_by, status, shared_at, subtotal_paise, place_of_supply, cgst_paise, sgst_paise, igst_paise, total_paise, created_at,
                                 decided_at, decision_note)
         VALUES ($1,$2,$3,$4::quotation_status, ($5::date + time '13:30') AT TIME ZONE 'Asia/Kolkata', $6,'24',$7,$8,0,$9, ($5::date + time '13:30') AT TIME ZONE 'Asia/Kolkata',
                 CASE WHEN $4 = 'APPROVED' THEN ($5::date + time '15:00') AT TIME ZONE 'Asia/Kolkata' END, CASE WHEN $4 = 'APPROVED' THEN 'Approved on the phone' END)`,
        [visitId, c.customerId, techId, part.waived ? 'SHARED' : 'APPROVED', day, sub, tax.cgstPaise, tax.sgstPaise, sub + tax.taxPaise]);
      await client.query(`INSERT INTO stock_moves (item_id, qty_delta, reason, visit_id, created_by) VALUES ($1, -1, 'USED_ON_TICKET', $2, $3)`, [part.id, visitId, techId]);
    };
    await solved(created[0], tech, 'Paper jam', 'Paper keeps jamming at the tray.', 'Replaced the pickup roller and tested 30 pages.', 2,
      'IN_WARRANTY', { id: roller, name: 'Paper pickup roller', price: 85000, waived: true });
    await solved(created[1], tech2, 'Print quality', 'Faded vertical streaks on every page.', 'Replaced the fuser assembly and ran a calibration.', 1,
      'EXPIRED', { id: fuser, name: 'Fuser assembly', price: 540000, waived: false });

    // Three tickets submitted through the public form, waiting on the dispatch board.
    const newTicket = async (customerId: string, siteId: string, assetId: string | null, productId: string, cat: string, desc: string, prio: number, name: string, phone: string, serial: string, minutesAgo: number) =>
      client.query(
        `INSERT INTO service_jobs (customer_id, site_id, asset_id, issue_category_id, description, status, priority, source, requester_name, requester_phone, serial_reported, created_at, product_id, service_id)
         VALUES ($1,$2,$3,$4,$5,'NEW',$6,'CUSTOMER',$7,$8,$9, now() - ($10 || ' minutes')::interval, $11, $12)`,
        [customerId, siteId, assetId, cats[cat], desc, prio, name, phone, serial, String(minutesAgo), productId, svcRepair]);
    const patelId = (await client.query(`INSERT INTO customers (name, phone) VALUES ('Patel Print House', '+919825111222') RETURNING id`)).rows[0].id;
    const patelSite = (await client.query(
      `INSERT INTO customer_sites (customer_id, label, address, city, state_code, contact_name, contact_phone)
       VALUES ($1,'Web request','Shop 9, Sector 21 Market','Gandhinagar','24','Hardik Patel','+919825111222') RETURNING id`, [patelId])).rows[0].id;
    await newTicket(patelId, patelSite, null, models.epson, 'Error code', 'Machine shows error E-502 and stops printing.', 2, 'Hardik Patel', '+919825111222', 'ZX9981234', 25);
    await newTicket(created[1].customerId, created[1].siteId, created[1].assetId, models.canon, 'Hardware failure', 'Copier makes a grinding noise and jams every few pages.', 1, 'Ritu Shah', '+919898000444', 'CNX7788991', 190);
    await newTicket(created[2].customerId, created[2].siteId, created[2].assetId, models.epson, 'Consumables', 'Low ink warning and light prints.', 3, 'Reception', '+919712000555', 'X4RT221877', 1500);

    await client.query('COMMIT');
    console.log('Seeded demo data.');
    console.log('  Technician: tech@bhawani.test   /  ' + DEMO_PASSWORD);
    console.log('  Technician: tech2@bhawani.test  /  ' + DEMO_PASSWORD);
    console.log('  Admin:      admin@bhawani.test  /  ' + DEMO_PASSWORD);
    console.log('  Add the dispatcher and more technicians in the app: Admin > Employees.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
