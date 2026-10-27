-- Bhawani Print and Pack — FSM schema (PostgreSQL 15+)
-- Money is stored as integer paise (never floats). Dates of service/warranty are DATE in IST.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- ───────── Users & access ─────────
CREATE TYPE user_role AS ENUM ('ADMIN', 'DISPATCHER', 'TECHNICIAN');

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     text NOT NULL,
  email         citext UNIQUE NOT NULL,
  phone         text,
  role          user_role NOT NULL,
  password_hash text NOT NULL,                -- argon2id
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ───────── Customers & sites ─────────
CREATE TABLE customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  gstin       text,
  email       citext,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_name_trgm ON customers USING gin (name gin_trgm_ops);

CREATE TABLE customer_sites (            -- a customer can have several locations
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES customers(id),
  label        text NOT NULL,            -- "Head office", "Plant 2"
  address      text NOT NULL,
  city         text,
  state_code   char(2) NOT NULL,         -- GST state code, e.g. '24' = Gujarat
  latitude     numeric(9,6),
  longitude    numeric(9,6),
  contact_name text,
  contact_phone text
);
CREATE INDEX sites_customer_idx ON customer_sites(customer_id);

-- ───────── Catalogue (models, parts, services) ─────────
CREATE TYPE item_type AS ENUM ('PRODUCT', 'PART', 'CONSUMABLE', 'SERVICE');

CREATE TABLE catalog_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type               item_type NOT NULL,
  sku                text UNIQUE NOT NULL,
  name               text NOT NULL,
  hsn_sac            text,
  unit_price_paise   bigint NOT NULL CHECK (unit_price_paise >= 0),
  gst_rate_bp        int NOT NULL DEFAULT 1800 CHECK (gst_rate_bp BETWEEN 0 AND 2800), -- 1800 = 18%
  default_warranty_months int CHECK (default_warranty_months BETWEEN 0 AND 60),
  warranty_covers    boolean NOT NULL DEFAULT false,  -- labour/part is waived when machine is in warranty (false for consumables)
  is_active          boolean NOT NULL DEFAULT true
);

-- ───────── Assets (every serial-numbered machine) ─────────
CREATE TABLE assets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        uuid NOT NULL REFERENCES customers(id),
  site_id            uuid NOT NULL REFERENCES customer_sites(id),
  model_id           uuid NOT NULL REFERENCES catalog_items(id),
  serial_number      text NOT NULL,
  warranty_start     date,                        -- purchase/installation date; NULL = unknown
  warranty_months    int  NOT NULL DEFAULT 12 CHECK (warranty_months BETWEEN 0 AND 60),
  warranty_end       date,                        -- computed by app (see warranty.service.ts)
  warranty_void      boolean NOT NULL DEFAULT false,
  warranty_void_reason text,
  sold_by_us         boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, serial_number),
  CHECK (warranty_end IS NULL OR warranty_start IS NULL OR warranty_end >= warranty_start),
  CHECK (NOT warranty_void OR warranty_void_reason IS NOT NULL)
);
CREATE INDEX assets_serial_trgm ON assets USING gin (serial_number gin_trgm_ops);
CREATE INDEX assets_customer_idx ON assets(customer_id);

-- Warranty extensions / AMC (keeps history instead of overwriting warranty_end)
CREATE TABLE warranty_extensions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    uuid NOT NULL REFERENCES assets(id),
  extra_months int NOT NULL CHECK (extra_months > 0),
  reason      text NOT NULL,
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ───────── Issue taxonomy (powers "recurring issues") ─────────
CREATE TABLE issue_categories (
  id    serial PRIMARY KEY,
  name  text UNIQUE NOT NULL           -- "Paper jam", "Head clog", "Error E-502"...
);

-- ───────── Jobs & visits ─────────
CREATE TYPE job_status   AS ENUM ('NEW','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED');
CREATE TYPE visit_status AS ENUM ('SCHEDULED','CHECKED_IN','COMPLETED','CANCELLED');
CREATE TYPE warranty_status AS ENUM ('IN_WARRANTY','EXPIRED','VOID','NO_RECORD','NOT_APPLICABLE');

CREATE TABLE service_jobs (               -- the customer's request
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_no        bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  customer_id   uuid NOT NULL REFERENCES customers(id),
  site_id       uuid NOT NULL REFERENCES customer_sites(id),
  asset_id      uuid REFERENCES assets(id),       -- NULL for product-sale-only jobs
  issue_category_id int REFERENCES issue_categories(id),
  description   text,
  status        job_status NOT NULL DEFAULT 'NEW',
  priority      smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  created_by    uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_status_idx ON service_jobs(status);
CREATE INDEX jobs_asset_idx  ON service_jobs(asset_id);

CREATE TABLE visits (                     -- one technician trip to one site
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES service_jobs(id),
  technician_id  uuid NOT NULL REFERENCES users(id),
  scheduled_for  timestamptz,
  status         visit_status NOT NULL DEFAULT 'SCHEDULED',
  checked_in_at  timestamptz,
  checkin_lat    numeric(9,6),
  checkin_lng    numeric(9,6),
  completed_at   timestamptz,
  service_date   date,                    -- date used for warranty evaluation
  work_done      text,
  -- snapshot of the warranty decision at completion (immutable audit trail)
  warranty_status        warranty_status,
  warranty_end_snapshot  date,
  warranty_override_by   uuid REFERENCES users(id),
  warranty_override_reason text,
  CHECK (warranty_override_by IS NULL OR warranty_override_reason IS NOT NULL)
);
CREATE INDEX visits_tech_date_idx ON visits(technician_id, scheduled_for);
CREATE INDEX visits_job_idx ON visits(job_id);

-- Breadcrumb trail for live/historical tracking (sent from the PWA while a visit is active)
CREATE TABLE location_pings (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  technician_id uuid NOT NULL REFERENCES users(id),
  visit_id      uuid REFERENCES visits(id),
  latitude      numeric(9,6) NOT NULL,
  longitude     numeric(9,6) NOT NULL,
  accuracy_m    real,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pings_tech_time_idx ON location_pings(technician_id, recorded_at DESC);

-- ───────── Billing ─────────
CREATE TYPE invoice_status AS ENUM ('ISSUED','PAID','PARTIALLY_PAID','VOID');

CREATE TABLE invoice_counters (           -- gapless numbering per financial year
  fy        text PRIMARY KEY,             -- '2026-27'
  last_no   int NOT NULL DEFAULT 0
);

CREATE TABLE invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no     text UNIQUE NOT NULL,    -- BPP/2026-27/000123
  visit_id       uuid UNIQUE REFERENCES visits(id),   -- one invoice per visit
  customer_id    uuid NOT NULL REFERENCES customers(id),
  issued_by      uuid NOT NULL REFERENCES users(id),
  issued_at      timestamptz NOT NULL DEFAULT now(),
  place_of_supply char(2) NOT NULL,
  subtotal_paise bigint NOT NULL,
  discount_paise bigint NOT NULL DEFAULT 0,
  cgst_paise     bigint NOT NULL DEFAULT 0,
  sgst_paise     bigint NOT NULL DEFAULT 0,
  igst_paise     bigint NOT NULL DEFAULT 0,
  total_paise    bigint NOT NULL,
  status         invoice_status NOT NULL DEFAULT 'ISSUED',
  pdf_key        text,                    -- object-storage key, set by the PDF worker
  idempotency_key text UNIQUE,            -- prevents double invoices on flaky mobile networks
  CHECK (total_paise = subtotal_paise - discount_paise + cgst_paise + sgst_paise + igst_paise)
);

CREATE TABLE invoice_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  catalog_item_id uuid NOT NULL REFERENCES catalog_items(id),
  description     text NOT NULL,
  hsn_sac         text,
  quantity        int NOT NULL CHECK (quantity > 0),
  unit_price_paise bigint NOT NULL,       -- price snapshot at billing time
  gst_rate_bp     int NOT NULL,
  warranty_waived boolean NOT NULL DEFAULT false,
  line_total_paise bigint NOT NULL        -- 0 when warranty_waived
);

CREATE TABLE payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES invoices(id),
  method       text NOT NULL CHECK (method IN ('CASH','UPI','CARD','BANK','CHEQUE')),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  reference    text,
  received_by  uuid NOT NULL REFERENCES users(id),
  received_at  timestamptz NOT NULL DEFAULT now()
);

-- Share links: random token, hashed at rest, expiring (so invoice PDFs are never guessable URLs)
CREATE TABLE invoice_share_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id),
  token_hash  bytea UNIQUE NOT NULL,      -- sha256(token)
  expires_at  timestamptz NOT NULL
);

CREATE TABLE audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id   uuid REFERENCES users(id),
  action     text NOT NULL,               -- 'invoice.create', 'warranty.override', ...
  entity     text NOT NULL,
  entity_id  uuid,
  detail     jsonb,
  at         timestamptz NOT NULL DEFAULT now()
);

-- ───────── Reporting views ─────────
-- Visits per customer: total, per month (since first visit), last visit
CREATE VIEW v_customer_visit_stats AS
SELECT c.id AS customer_id, c.name,
       count(v.id)                                  AS total_visits,
       min(v.service_date)                          AS first_visit,
       max(v.service_date)                          AS last_visit,
       round(count(v.id)::numeric /
             GREATEST(1, (date_part('year', age(current_date, min(v.service_date))) * 12
                        + date_part('month', age(current_date, min(v.service_date))) + 1))::numeric, 2)
                                                    AS avg_visits_per_month
FROM customers c
LEFT JOIN service_jobs j ON j.customer_id = c.id
LEFT JOIN visits v ON v.job_id = j.id AND v.status = 'COMPLETED'
GROUP BY c.id, c.name;

CREATE VIEW v_customer_visits_by_month AS
SELECT j.customer_id, date_trunc('month', v.service_date)::date AS month, count(*) AS visits
FROM visits v JOIN service_jobs j ON j.id = v.job_id
WHERE v.status = 'COMPLETED'
GROUP BY 1, 2;

-- Recurring issues: same asset + same category 2+ times in the last 180 days
CREATE VIEW v_recurring_issues AS
SELECT j.asset_id, a.serial_number, j.customer_id, ic.name AS issue,
       count(*) AS occurrences, max(v.service_date) AS last_seen
FROM service_jobs j
JOIN visits v ON v.job_id = j.id AND v.status = 'COMPLETED'
JOIN assets a ON a.id = j.asset_id
JOIN issue_categories ic ON ic.id = j.issue_category_id
WHERE v.service_date >= current_date - 180
GROUP BY j.asset_id, a.serial_number, j.customer_id, ic.name
HAVING count(*) >= 2;
