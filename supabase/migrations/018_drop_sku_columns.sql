-- 018_drop_sku_columns.sql
-- PR1.6 — broad-scope SKU surface deletion (A2 + B per DECISIONS.md D27).
--
-- Drops six columns that exclusively support the deleted attorney-report
-- and agent-subscription SKUs:
--
--   - users.stripe_subscription_id   (added in 008)
--   - users.subscription_status      (added in 008)
--   - users.agent_name               (added in 008)
--   - users.brokerage                (added in 008)
--   - lookups.report_type            (added in 001)
--   - reports.matter_reference       (added in 006)
--
-- Pre-flight audit (run via MCP read-only on prod 2026-04-30):
--   - All six columns are NULL/empty on every row in prod (verified via
--     SELECT COUNT(*) WHERE <col> IS NOT NULL — every count was 0).
--   - pg_depend shows the only dependents of these columns are auto-generated
--     CHECK constraints (lookups_report_type_check, users_subscription_status_check)
--     and the index idx_users_subscription_status — all of which Postgres
--     auto-drops with the column. No FKs, triggers, or views depend on them.
--   - The 'attorney' enum value of lookups.report_type was never written to
--     a row in prod; no historical signal is lost by dropping the column.
--
-- DO NOT edit migrations 001, 006, or 008 — those are immutable. This is a
-- forward-only drop migration.
--
-- Idempotent: every DROP COLUMN uses IF EXISTS.

BEGIN;

-- users — drop the four 008 subscription/agent columns
ALTER TABLE public.users DROP COLUMN IF EXISTS stripe_subscription_id;
ALTER TABLE public.users DROP COLUMN IF EXISTS subscription_status;
ALTER TABLE public.users DROP COLUMN IF EXISTS agent_name;
ALTER TABLE public.users DROP COLUMN IF EXISTS brokerage;
-- The CHECK constraint users_subscription_status_check and the index
-- idx_users_subscription_status are auto-dropped with the column.

-- lookups — drop the 001 report_type column (and its CHECK constraint and DEFAULT, both auto-drop)
ALTER TABLE public.lookups DROP COLUMN IF EXISTS report_type;

-- reports — drop the 006 matter_reference column
ALTER TABLE public.reports DROP COLUMN IF EXISTS matter_reference;

COMMIT;
