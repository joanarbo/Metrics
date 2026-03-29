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

-- Caché diaria (UTC) de alertas/acciones IA del dashboard; precalentada por cron.
CREATE TABLE IF NOT EXISTS dashboard_insights_cache (
  id BIGSERIAL PRIMARY KEY,
  insight_date_utc DATE NOT NULL,
  period_key TEXT NOT NULL,
  compare_mode BOOLEAN NOT NULL DEFAULT true,
  source_stored BOOLEAN NOT NULL DEFAULT false,
  user_id_filter_hash TEXT NOT NULL DEFAULT '',
  alerts JSONB NOT NULL,
  actions JSONB NOT NULL,
  data_note TEXT,
  model TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dashboard_insights_daily UNIQUE (
    insight_date_utc,
    period_key,
    compare_mode,
    source_stored,
    user_id_filter_hash
  )
);

CREATE INDEX IF NOT EXISTS idx_dashboard_insights_computed ON dashboard_insights_cache (computed_at DESC);

-- Caché diaria (UTC) del JSON completo de GET /api/analytics/traffic (lectura rápida desde Neon).
-- `period_key`: 30d | 90d | ytd | legacy-N (N = días cuando no hay preset).
CREATE TABLE IF NOT EXISTS dashboard_traffic_cache (
  id BIGSERIAL PRIMARY KEY,
  cache_date_utc DATE NOT NULL,
  period_key TEXT NOT NULL,
  compare_mode BOOLEAN NOT NULL DEFAULT true,
  strip_mode BOOLEAN NOT NULL DEFAULT false,
  locations_mode BOOLEAN NOT NULL DEFAULT false,
  source_stored BOOLEAN NOT NULL DEFAULT false,
  user_id_filter_hash TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dashboard_traffic_daily UNIQUE (
    cache_date_utc,
    period_key,
    compare_mode,
    strip_mode,
    locations_mode,
    source_stored,
    user_id_filter_hash
  )
);

CREATE INDEX IF NOT EXISTS idx_dashboard_traffic_computed ON dashboard_traffic_cache (computed_at DESC);

-- Un snapshot diario (UTC) de suscriptores Neon por marca (suma portfolio). Sirve para Δ vs periodo y barras semanales TV.
CREATE TABLE IF NOT EXISTS subscriber_portfolio_daily (
  snapshot_date_utc DATE NOT NULL PRIMARY KEY,
  total_subscribers INT NOT NULL,
  by_brand JSONB NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriber_portfolio_computed ON subscriber_portfolio_daily (computed_at DESC);
