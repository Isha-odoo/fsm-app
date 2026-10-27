-- Migration 003: break-fix ticketing.
--   Customer raises a ticket (public form, status NEW) -> admin assigns a technician -> technician visits and marks it
--   SOLVED (work done, parts used, warranty snapshot; no prices) -> admin generates the invoice.
-- A "ticket" is a row in service_jobs; job_no is the ticket number. Run after 001 and 002.

-- ADD VALUE must be committed before the new value is used, so it sits outside the transaction below.
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'SOLVED';

BEGIN;

-- COMPLETED is replaced by SOLVED (the enum value stays, it is just no longer used).
UPDATE service_jobs SET status = 'SOLVED' WHERE status = 'COMPLETED';

ALTER TABLE service_jobs
  ALTER COLUMN created_by DROP NOT NULL,                       -- customer-submitted tickets have no staff creator
  ADD COLUMN source          text NOT NULL DEFAULT 'ADMIN' CHECK (source IN ('CUSTOMER', 'ADMIN')),
  ADD COLUMN requester_name  text,                             -- who filled in the public form
  ADD COLUMN requester_phone text,
  ADD COLUMN requester_email citext,
  ADD COLUMN serial_reported text,                             -- serial exactly as typed; asset_id is set only if it matched
  ADD COLUMN service_address text,                             -- set only when it differs from the linked site's address
  ADD COLUMN idempotency_key text UNIQUE,                      -- double-submit protection on the public form
  ADD COLUMN solved_at       timestamptz,
  ADD CONSTRAINT jobs_creator_ck CHECK (source = 'CUSTOMER' OR created_by IS NOT NULL);

UPDATE service_jobs j SET solved_at = (SELECT max(v.completed_at) FROM visits v WHERE v.job_id = j.id)
 WHERE j.status = 'SOLVED';

CREATE INDEX jobs_created_idx ON service_jobs(created_at DESC);

-- Visits: retry-safe "solve" and at most one open visit per ticket (guards concurrent assignments).
ALTER TABLE visits ADD COLUMN solve_idempotency_key text UNIQUE;
CREATE UNIQUE INDEX visits_one_open_per_job ON visits(job_id) WHERE status IN ('SCHEDULED', 'CHECKED_IN');

-- Parts the technician logged when solving. unit_price_paise is a snapshot for the admin's invoice and is
-- never returned to technicians. warranty_waived is decided on the server from the warranty snapshot.
CREATE TABLE visit_parts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id         uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  catalog_item_id  uuid NOT NULL REFERENCES catalog_items(id),
  description      text NOT NULL,
  quantity         int NOT NULL CHECK (quantity > 0),
  unit_price_paise bigint NOT NULL CHECK (unit_price_paise >= 0),
  warranty_waived  boolean NOT NULL DEFAULT false
);
CREATE INDEX visit_parts_visit_idx ON visit_parts(visit_id);

-- ───────── Reports ─────────
-- Per technician: open tickets, sites visited (checked in), tickets solved.
CREATE VIEW v_technician_stats AS
SELECT u.id AS technician_id, u.full_name AS name,
       (count(v.id) FILTER (WHERE v.status IN ('SCHEDULED', 'CHECKED_IN')))::int AS active_tickets,
       (count(v.id) FILTER (WHERE v.checked_in_at IS NOT NULL))::int            AS total_visits,
       (count(v.id) FILTER (WHERE v.status = 'COMPLETED'))::int                 AS solved_tickets,
       max(v.completed_at)                                                      AS last_solved_at
FROM users u
LEFT JOIN visits v ON v.technician_id = u.id
WHERE u.role = 'TECHNICIAN' AND u.is_active
GROUP BY u.id, u.full_name;

-- Per customer: tickets raised vs solved vs still open.
CREATE VIEW v_customer_ticket_stats AS
SELECT c.id AS customer_id, c.name, c.phone,
       count(j.id)::int                                                              AS tickets_raised,
       (count(j.id) FILTER (WHERE j.status = 'SOLVED'))::int                         AS tickets_solved,
       (count(j.id) FILTER (WHERE j.status IN ('NEW', 'ASSIGNED', 'IN_PROGRESS')))::int AS tickets_open,
       max(j.created_at)                                                             AS last_ticket_at
FROM customers c
LEFT JOIN service_jobs j ON j.customer_id = c.id
GROUP BY c.id, c.name, c.phone;

COMMIT;
