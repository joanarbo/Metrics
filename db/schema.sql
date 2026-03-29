-- Ejecutar una vez en Neon (SQL Editor o psql).
CREATE TABLE IF NOT EXISTS ga_property_snapshot (
  property_resource TEXT PRIMARY KEY,
  account_resource TEXT NOT NULL,
  account_api_name TEXT NOT NULL DEFAULT '',
  account_display_name TEXT NOT NULL,
  property_display_name TEXT NOT NULL,
  property_type TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ga_property_snapshot_account ON ga_property_snapshot (account_resource);
CREATE INDEX IF NOT EXISTS idx_ga_property_snapshot_updated ON ga_property_snapshot (updated_at DESC);
