-- Idempotent database bootstrap. Runs as the postgres superuser on every
-- install/upgrade (Helm hook Job) and at first start under Docker Compose.
--   psql -v app_password=... -v reader_password=... -f bootstrap.sql
--
--   metrics_app     owns database "metrics" (schema managed by Alembic)
--   metrics_reader  read-only login on database "sampledata" (demo warehouse)
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE metrics_app LOGIN PASSWORD %L', :'app_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metrics_app') \gexec
SELECT format('ALTER ROLE metrics_app LOGIN PASSWORD %L', :'app_password') \gexec

SELECT format('CREATE ROLE metrics_reader LOGIN PASSWORD %L', :'reader_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metrics_reader') \gexec
SELECT format('ALTER ROLE metrics_reader LOGIN PASSWORD %L', :'reader_password') \gexec

SELECT 'CREATE DATABASE metrics OWNER metrics_app'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'metrics') \gexec
SELECT 'CREATE DATABASE sampledata'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'sampledata') \gexec

\connect metrics
ALTER SCHEMA public OWNER TO metrics_app;

\connect sampledata
REVOKE ALL ON DATABASE sampledata FROM PUBLIC;
GRANT CONNECT ON DATABASE sampledata TO metrics_reader;
CREATE SCHEMA IF NOT EXISTS analytics;
ALTER ROLE metrics_reader IN DATABASE sampledata SET default_transaction_read_only = on;

-- Daily service-desk activity: aggregate weekly/monthly with SUM or AVG.
CREATE TABLE IF NOT EXISTS analytics.service_desk_daily (
  day               date PRIMARY KEY,
  tickets_opened    integer NOT NULL,
  tickets_resolved  integer NOT NULL,
  avg_resolution_h  numeric(6,2) NOT NULL,
  commentary        text
);
INSERT INTO analytics.service_desk_daily
SELECT d::date,
       (150 + 40*sin(extract(doy FROM d)/9.0) + (hashtext(d::text) % 25))::int,
       (140 + 0.15*extract(doy FROM d) + 35*sin(extract(doy FROM d)/9.0) + (hashtext(d::text || 'r') % 20))::int,
       round((30 - 0.03*extract(doy FROM d) + 4*cos(extract(doy FROM d)/7.0))::numeric, 2),
       CASE WHEN extract(isodow FROM d) = 5 THEN
         (ARRAY['Backlog reduced after the Thursday triage session.',
                'Password-reset volumes remained high following the SSO change.',
                'Two senior analysts on leave; resolution times rose slightly.',
                'Automation of laptop provisioning cut manual tickets.',
                'Major incident on the payroll system drove extra volume.'])[1 + abs(hashtext(d::text)) % 5]
       END
  FROM generate_series(date '2025-07-01', date '2026-12-31', interval '1 day') AS d
 WHERE NOT EXISTS (SELECT 1 FROM analytics.service_desk_daily)
   AND extract(isodow FROM d) < 6;

-- Monthly regional sales: one row per region per month.
CREATE TABLE IF NOT EXISTS analytics.regional_sales (
  month       date NOT NULL,
  region      text NOT NULL,
  revenue_gbp numeric(14,2) NOT NULL,
  orders      integer NOT NULL,
  notes       text,
  PRIMARY KEY (month, region)
);
INSERT INTO analytics.regional_sales
SELECT m::date, r,
       round((250000 + 9000*extract(month FROM m) + 40000*sin(extract(month FROM m)) +
              CASE r WHEN 'North' THEN -30000 WHEN 'South' THEN 25000 ELSE 0 END)::numeric, 2),
       (1200 + 50*extract(month FROM m) + (hashtext(m::text || r) % 90))::int,
       CASE r WHEN 'North' THEN 'Northern region continues to trail plan.' END
  FROM generate_series(date '2025-01-01', date '2026-12-01', interval '1 month') AS m,
       unnest(ARRAY['North','South','Midlands']) AS r
 WHERE NOT EXISTS (SELECT 1 FROM analytics.regional_sales);

GRANT USAGE ON SCHEMA analytics TO metrics_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO metrics_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT ON TABLES TO metrics_reader;
