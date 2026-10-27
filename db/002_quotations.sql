-- Migration 002: technicians issue QUOTATIONS on site; final GST invoices are created later by admins.
-- Run after 001_schema.sql.
BEGIN;

CREATE TYPE quotation_status AS ENUM ('DRAFT', 'SHARED', 'APPROVED', 'REJECTED');

-- Plain sequential numbering: BPP-QT-1001, BPP-QT-1002, ... (gaps after a rolled-back insert are acceptable here).
CREATE SEQUENCE quotation_no_seq START 1001;

CREATE TABLE quotations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_no     text UNIQUE NOT NULL DEFAULT ('BPP-QT-' || nextval('quotation_no_seq')::text),
  visit_id         uuid UNIQUE NOT NULL REFERENCES visits(id),     -- one quotation per visit
  customer_id      uuid NOT NULL REFERENCES customers(id),
  created_by       uuid NOT NULL REFERENCES users(id),
  status           quotation_status NOT NULL DEFAULT 'DRAFT',
  subtotal_paise   bigint NOT NULL DEFAULT 0 CHECK (subtotal_paise >= 0),  -- excludes GST; GST is applied on the final invoice
  valid_until      date NOT NULL DEFAULT (current_date + 15),
  shared_at        timestamptz,
  decided_at       timestamptz,
  decided_by       uuid REFERENCES users(id),
  decision_note    text,
  idempotency_key  text UNIQUE,                                    -- safe retries from flaky mobile networks
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'DRAFT' OR shared_at IS NOT NULL),
  CHECK ((status IN ('APPROVED', 'REJECTED')) = (decided_at IS NOT NULL))
);
ALTER SEQUENCE quotation_no_seq OWNED BY quotations.quotation_no;
CREATE INDEX quotations_customer_idx ON quotations(customer_id);
CREATE INDEX quotations_status_idx   ON quotations(status);

CREATE TABLE quotation_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id      uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  catalog_item_id   uuid NOT NULL REFERENCES catalog_items(id),
  description       text NOT NULL,
  quantity          int NOT NULL CHECK (quantity > 0),
  unit_price_paise  bigint NOT NULL CHECK (unit_price_paise >= 0),  -- snapshot of the catalog price
  warranty_waived   boolean NOT NULL DEFAULT false,
  line_total_paise  bigint NOT NULL CHECK (line_total_paise >= 0)   -- 0 when warranty_waived
);
CREATE INDEX quotation_items_quotation_idx ON quotation_items(quotation_id);

-- Customer-facing link to the quotation PDF: random token, only its hash is stored, expires.
CREATE TABLE quotation_share_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id  uuid NOT NULL REFERENCES quotations(id),
  token_hash    bytea UNIQUE NOT NULL,
  expires_at    timestamptz NOT NULL
);

-- Invoices are now created by admins only, normally from an APPROVED quotation.
-- (invoice_counters keeps the strict GST numbering; it is no longer touched by the mobile flow.)
ALTER TABLE invoices ADD COLUMN quotation_id uuid REFERENCES quotations(id);
CREATE UNIQUE INDEX invoices_one_live_per_quotation ON invoices(quotation_id) WHERE status <> 'VOID';

COMMIT;
