-- Production ops hardening: API metrics, synthetic checks, alert log

CREATE TABLE IF NOT EXISTS platform_api_metrics (
  bucket_start TIMESTAMPTZ NOT NULL,
  route TEXT NOT NULL,
  count_2xx INTEGER NOT NULL DEFAULT 0,
  count_4xx INTEGER NOT NULL DEFAULT 0,
  count_5xx INTEGER NOT NULL DEFAULT 0,
  latency_total_ms BIGINT NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_start, route)
);

CREATE INDEX IF NOT EXISTS idx_platform_api_metrics_bucket
  ON platform_api_metrics(bucket_start DESC);

CREATE TABLE IF NOT EXISTS platform_synthetic_checks (
  id BIGSERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_name TEXT NOT NULL,
  target_url TEXT NOT NULL DEFAULT '',
  ok BOOLEAN NOT NULL,
  status_code INTEGER,
  latency_ms INTEGER,
  message TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_platform_synthetic_checks_at
  ON platform_synthetic_checks(checked_at DESC);

CREATE TABLE IF NOT EXISTS platform_alert_log (
  id BIGSERIAL PRIMARY KEY,
  alerted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  alert_key TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warn',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  delivered BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_platform_alert_log_at
  ON platform_alert_log(alerted_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_alert_log_key
  ON platform_alert_log(alert_key, alerted_at DESC);
