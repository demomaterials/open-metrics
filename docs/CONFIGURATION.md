# Configuration

## Backend environment variables

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` | `localhost` / `5432` / `metrics` / `metrics_app` | Application database |
| `DB_PASSWORD` | – | **Secret** (`metrics-db-credentials.APP_DB_PASSWORD`) |
| `DB_SSLMODE` | `prefer` | libpq sslmode for the application database |
| `DATABASE_URL` | – | Full SQLAlchemy URL. Overrides the `DB_*` variables. |
| `SECRET_ENCRYPTION_KEY` | – | **Secret.** Encrypts data-source passwords (any long random string). |
| `SESSION_HOURS` | `12` | Session lifetime |
| `COOKIE_SECURE` | `true` | Set to `false` only for plain-HTTP development |
| `ADMIN_USERNAME` | `admin` | First administrator, created when no users exist |
| `ADMIN_PASSWORD` | – | **Secret.** Used only for that first creation. |
| `SEED_DEMO` | `true` | Seed the demo boards when no boards exist |
| `SAMPLE_SOURCE_HOST` / `_PORT` / `_DATABASE` / `_USER` / `_PASSWORD` | – / 5432 / `sampledata` / `metrics_reader` / – | When the host and password are set, the demo seed registers the sample warehouse as an external data source |
| `EXTERNAL_STATEMENT_TIMEOUT_MS` | `15000` | `statement_timeout` for external source queries |
| `EXTERNAL_CONNECT_TIMEOUT_S` | `5` | Connect timeout for external sources |
| `LOG_LEVEL` | `info` | Python log level |

## Frontend container

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URL` | `http://backend:8080` | Where nginx proxies `/api` (Compose and single-entry setups) |

## Kubernetes Secrets

| Secret | Keys | Used by |
|---|---|---|
| `metrics-db-credentials` | `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `READER_DB_PASSWORD` | metrics-db (all), backend and migrations (`APP_DB_PASSWORD`, `READER_DB_PASSWORD`) |
| `metrics-app-secrets` | `SECRET_ENCRYPTION_KEY`, `ADMIN_PASSWORD` | backend, migrations |
| `metrics-tls` | `tls.crt`, `tls.key` | Ingress or Gateway |

## Helm values

See the commented `values.yaml` of each chart:

- `deploy/helm/metrics-db/values.yaml`: image, persistence size and
  storageClass, resources, bootstrap Job, NetworkPolicy.
- `deploy/helm/metrics-app/values.yaml`: hostname, images, replicas and
  resources, `config.*` (rendered into the `metrics-config` ConfigMap),
  `sampleSource`, `ingress`, `httpRoute`, `gateway`, `networkPolicy`.

## CSV import format

```csv
period,value,narrative
2026-W10,87.4,"Improved after faster response times."
2026-W11,88.1,
```

- `period` (or `period_start` or `date`) accepts `2026-03-02`, `2026-W10`,
  `2026-03` or `2026-Q1`. A date snaps to the metric's period.
- An optional `period_end` column overrides the computed end date.
- `value` may contain thousands separators or a trailing `%`. An empty value
  means "no value".
- Import is an upsert per period. Validate first: the import is rejected as a
  whole if any row has an error.
