-- Migration 005: technicians create a QUOTATION when they solve a ticket (prices, warranty, GST), share it with the
-- customer, and admins see and invoice it. Reuses the quotations tables from 002. Run after 004.
BEGIN;

-- Lines the technician logs (parts, consumables, services) keep the GST rate and HSN/SAC they were quoted with,
-- so the quotation, the customer's copy and the final invoice always show the same figures.
ALTER TABLE visit_parts ADD COLUMN gst_rate_bp int, ADD COLUMN hsn_sac text;
UPDATE visit_parts vp SET gst_rate_bp = ci.gst_rate_bp, hsn_sac = ci.hsn_sac
  FROM catalog_items ci WHERE ci.id = vp.catalog_item_id;
ALTER TABLE visit_parts ALTER COLUMN gst_rate_bp SET NOT NULL;

-- A quotation is a header over the visit's lines (visit_parts) with the totals frozen at quote time.
ALTER TABLE quotations
  ADD COLUMN place_of_supply char(2),
  ADD COLUMN cgst_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN sgst_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN igst_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN total_paise bigint NOT NULL DEFAULT 0;
UPDATE quotations SET total_paise = subtotal_paise;
CREATE INDEX quotations_created_idx ON quotations(created_at DESC);

ALTER TABLE quotation_share_links ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

COMMIT;
