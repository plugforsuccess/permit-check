-- 020_fix_reports_v2_property_fk.sql
-- Follow-up to PR4 (019). One-purpose migration: changes
-- reports_v2.property_id FK to ON DELETE SET NULL.
--
-- Why:
--   `properties` is a 30-day TTL cache. The eviction job (PR6) runs
--   `DELETE FROM properties WHERE created_at < NOW() - INTERVAL '30 days'`.
--   `reports_v2` rows are billed receipts and never deleted. With the
--   default NO ACTION FK behavior shipped in 019, every property that
--   ever had a report blocks eviction permanently. SET NULL lets the
--   eviction proceed; the report keeps its history with property_id
--   nulled out (the report's `raw_address`, `report_json`, and
--   `report_pdf_path` are sufficient to reconstruct context for refunds
--   / disputes / re-runs).
--
-- Pre-flight verified (read-only via MCP):
--   - reports_v2.property_id is_nullable = YES (required for SET NULL)
--   - exactly one FK to drop: reports_v2_property_id_fkey
--   - reports_v2 row count = 0 (no existing rows to validate against)
--
-- Idempotent shape: DROP CONSTRAINT IF EXISTS, then add the new constraint
-- with the exact same name. If the migration replays against a DB where
-- the FK already has SET NULL, the DROP succeeds (or no-ops with IF
-- EXISTS) and the ADD recreates the same shape.
--
-- Apply path: direct-to-prod via MCP `apply_migration` per D26
-- pre-customer expedited path (zero paying customers; first non-Cameron
-- $29 transaction is the hard cutoff that retires this path).

BEGIN;

ALTER TABLE public.reports_v2
  DROP CONSTRAINT IF EXISTS reports_v2_property_id_fkey;

ALTER TABLE public.reports_v2
  ADD CONSTRAINT reports_v2_property_id_fkey
    FOREIGN KEY (property_id)
    REFERENCES public.properties(id)
    ON DELETE SET NULL;

COMMIT;
