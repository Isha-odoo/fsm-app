/**
 * One printable document shape for quotations and invoices, so the same screen renders both
 * (technician share link, public customer page, admin quotation and invoice pages).
 */
import { config } from '../../config';
import type { Db } from '../quotations/quote';

export interface DocLine { description: string; hsnSac: string | null; quantity: number; unitPricePaise: number; gstRateBp: number; warrantyWaived: boolean; lineTotalPaise: number }

export const seller = () => ({
  name: config.COMPANY_NAME, address: config.COMPANY_ADDRESS, gstin: config.COMPANY_GSTIN,
  phone: config.COMPANY_PHONE, email: config.COMPANY_EMAIL, stateCode: config.SELLER_STATE_CODE,
});

const CONTEXT = `
  c.name AS "customerName", c.gstin AS "customerGstin", c.email AS "customerEmail",
  COALESCE(j.requester_name, s.contact_name) AS "contactName",
  COALESCE(j.requester_phone, s.contact_phone, c.phone) AS "customerPhone",
  COALESCE(j.service_address, s.address) AS address, s.city, s.state_code AS "stateCode",
  j.id AS "ticketId", j.job_no::int AS "ticketNo",
  COALESCE(m.name, pr.name) AS product, COALESCE(a.serial_number, j.serial_reported) AS serial, sv.name AS service,
  v.work_done AS solution, v.warranty_status AS "warrantyStatus", to_char(v.warranty_end_snapshot, 'YYYY-MM-DD') AS "warrantyEnd",
  v.completed_at AS "solvedAt", t.full_name AS technician`;
const JOINS = `
  JOIN service_jobs j ON j.id = v.job_id
  JOIN customers c ON c.id = j.customer_id
  JOIN customer_sites s ON s.id = j.site_id
  LEFT JOIN assets a ON a.id = j.asset_id
  LEFT JOIN catalog_items m ON m.id = a.model_id
  LEFT JOIN catalog_items pr ON pr.id = j.product_id
  LEFT JOIN catalog_items sv ON sv.id = j.service_id
  LEFT JOIN users t ON t.id = v.technician_id`;

function shape(kind: 'QUOTATION' | 'INVOICE', r: any, lines: DocLine[]) {
  return {
    kind,
    id: r.id as string,
    number: r.number as string,
    date: r.date as string,
    validUntil: (r.validUntil as string | null) ?? null,
    status: r.status as string,
    quotationNo: (r.quotationNo as string | null) ?? null,
    decision: r.decidedAt ? { at: r.decidedAt as string, note: (r.decisionNote as string | null) ?? null } : null,
    seller: seller(),
    customer: {
      name: r.customerName, contactName: r.contactName, phone: r.customerPhone, email: r.customerEmail, gstin: r.customerGstin,
      address: r.address, city: r.city, stateCode: String(r.stateCode).trim(),
    },
    ticket: { id: r.ticketId as string, ticketNo: r.ticketNo as number, product: r.product, serial: r.serial, service: r.service, solution: r.solution, technician: r.technician, solvedAt: r.solvedAt },
    warranty: r.warrantyStatus ? { status: r.warrantyStatus as string, endDate: (r.warrantyEnd as string | null) ?? null } : null,
    placeOfSupply: String(r.placeOfSupply).trim(),
    lines,
    subtotalPaise: Number(r.subtotal), cgstPaise: Number(r.cgst), sgstPaise: Number(r.sgst), igstPaise: Number(r.igst), totalPaise: Number(r.total),
  };
}

const lineOf = (l: any): DocLine => ({
  description: l.description, hsnSac: l.hsn_sac, quantity: l.quantity, unitPricePaise: Number(l.unit_price_paise), gstRateBp: l.gst_rate_bp,
  warrantyWaived: l.warranty_waived, lineTotalPaise: l.warranty_waived ? 0 : Number(l.unit_price_paise) * l.quantity,
});

/** Quotation by id or by the hash of a customer share token. */
export async function loadQuotation(db: Db, by: { id: string } | { tokenHash: Buffer }) {
  const where = 'id' in by ? 'q.id = $1' : `q.id = (SELECT quotation_id FROM quotation_share_links WHERE token_hash = $1 AND expires_at > now())`;
  const { rows } = await db.query(
    `SELECT q.id, q.quotation_no AS number, q.status, q.created_at AS date, to_char(q.valid_until, 'YYYY-MM-DD') AS "validUntil",
            q.created_by AS "createdBy", q.visit_id AS "visitId", q.place_of_supply AS "placeOfSupply",
            q.subtotal_paise AS subtotal, q.cgst_paise AS cgst, q.sgst_paise AS sgst, q.igst_paise AS igst, q.total_paise AS total,
            q.decided_at AS "decidedAt", q.decision_note AS "decisionNote",
            ${CONTEXT}
       FROM quotations q JOIN visits v ON v.id = q.visit_id ${JOINS}
      WHERE ${where}`,
    ['id' in by ? by.id : by.tokenHash],
  );
  if (!rows[0]) return null;
  const lines = (await db.query(`SELECT description, hsn_sac, quantity, unit_price_paise, gst_rate_bp, warranty_waived FROM visit_parts WHERE visit_id = $1 ORDER BY description`, [rows[0].visitId])).rows.map(lineOf);
  return { doc: shape('QUOTATION', rows[0], lines), createdBy: rows[0].createdBy as string };
}

export async function loadInvoice(db: Db, id: string) {
  const { rows } = await db.query(
    `SELECT i.id, i.invoice_no AS number, i.status, i.issued_at AS date, i.place_of_supply AS "placeOfSupply",
            i.subtotal_paise AS subtotal, i.cgst_paise AS cgst, i.sgst_paise AS sgst, i.igst_paise AS igst, i.total_paise AS total,
            qt.quotation_no AS "quotationNo",
            ${CONTEXT}
       FROM invoices i JOIN visits v ON v.id = i.visit_id ${JOINS}
       LEFT JOIN quotations qt ON qt.id = i.quotation_id
      WHERE i.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const lines = (await db.query(`SELECT description, hsn_sac, quantity, unit_price_paise, gst_rate_bp, warranty_waived FROM invoice_items WHERE invoice_id = $1 ORDER BY description`, [id])).rows.map(lineOf);
  return shape('INVOICE', rows[0], lines);
}
