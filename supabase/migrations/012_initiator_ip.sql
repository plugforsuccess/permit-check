-- Add initiator_ip to lookups for caller verification on scrape/refresh/regenerate.
-- Stored as text (not inet) because the value comes from x-forwarded-for which
-- may contain IPv4-mapped IPv6 or other proxy formats.
ALTER TABLE lookups ADD COLUMN IF NOT EXISTS initiator_ip text;
