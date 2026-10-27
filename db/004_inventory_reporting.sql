-- Migration 004: inventory (products, services, parts with stock), ticket product + service, who assigned a ticket.
-- Run after 003. Safe on a database that already has tickets: existing rows are backfilled.
BEGIN;

-- Catalogue: which items customers can pick on the public request form, and a low-stock threshold.
ALTER TABLE catalog_items
  ADD COLUMN requestable   boolean NOT NULL DEFAULT false,
  ADD COLUMN reorder_level int NOT NULL DEFAULT 0 CHECK (reorder_level >= 0);
UPDATE catalog_items SET requestable = true WHERE type = 'PRODUCT';

-- A ticket is about a product (machine model) and asks for a service (repair, installation, maintenance ...).
-- product_id is the machine's model when the serial matched, otherwise what the customer picked on the form.
ALTER TABLE service_jobs
  ADD COLUMN product_id uuid REFERENCES catalog_items(id),
  ADD COLUMN service_id uuid REFERENCES catalog_items(id);
UPDATE service_jobs j SET product_id = a.model_id FROM assets a WHERE a.id = j.asset_id;
CREATE INDEX jobs_product_idx ON service_jobs(product_id);
CREATE INDEX jobs_customer_created_idx ON service_jobs(customer_id, created_at DESC);

-- Who dispatched the ticket, and when.
ALTER TABLE visits
  ADD COLUMN assigned_by uuid REFERENCES users(id),
  ADD COLUMN assigned_at timestamptz NOT NULL DEFAULT now();
UPDATE visits SET assigned_at = COALESCE(scheduled_for, completed_at, now());

-- Stock ledger: on-hand quantity is the sum of the movements, so every change has an author and a reason.
CREATE TABLE stock_moves (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid NOT NULL REFERENCES catalog_items(id),
  qty_delta  int NOT NULL CHECK (qty_delta <> 0),
  reason     text NOT NULL CHECK (reason IN ('OPENING', 'PURCHASE', 'ADJUSTMENT', 'USED_ON_TICKET')),
  visit_id   uuid REFERENCES visits(id),
  note       text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_moves_item_idx ON stock_moves(item_id);

-- Parts already used on solved tickets become usage movements (starting balance is whatever you receive from now on).
INSERT INTO stock_moves (item_id, qty_delta, reason, visit_id, created_at)
SELECT vp.catalog_item_id, -vp.quantity, 'USED_ON_TICKET', vp.visit_id, COALESCE(v.completed_at, now())
  FROM visit_parts vp JOIN visits v ON v.id = vp.visit_id;

-- Reports now take date filters, so they are queries in the API instead of views.
DROP VIEW IF EXISTS v_technician_stats;
DROP VIEW IF EXISTS v_customer_ticket_stats;

COMMIT;
