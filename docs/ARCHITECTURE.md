# Architecture

## Components

```
 Browser ──HTTPS──▶ Ingress / Envoy Gateway ──┬── /api ──▶ metrics-backend (FastAPI, :8080) ──▶ metrics-db (PostgreSQL)
                                              │                         │
                                              └── /    ──▶ metrics-frontend (nginx + React SPA)   └──▶ external PostgreSQL sources
                                                                                                        (read-only sessions)
```

| Component | Technology | Notes |
|---|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Recharts, Radix UI (shadcn-style components), TanStack Query | Static build served by unprivileged nginx. The nginx config also proxies `/api` for Compose. |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2, Alembic, psycopg 3 | Stateless. Sessions live in PostgreSQL, so replicas can scale horizontally. |
| Database | PostgreSQL 17 | Database `metrics` (owned by `metrics_app`) and an optional `sampledata` warehouse (`metrics_reader`, read-only). |
| Migrations | Alembic | Helm pre-install/pre-upgrade Job (`python -m app.cli init`) runs migrations, creates the first admin and seeds the demo once. It holds an advisory lock, so concurrent runs are safe. |

## Database schema

```
users(id, username UQ, display_name, password_hash, role ∈ {admin,viewer}, is_active, last_login_at, created_at, updated_at)
sessions(id, token_hash UQ, user_id → users ON DELETE CASCADE, created_at, expires_at)

data_sources(id, name UQ, kind='postgresql', host, port, database, username,
             password_encrypted BYTEA, sslmode, read_only, created_at, updated_at)

metrics(id, name UQ, description, unit, unit_label, decimals,
        direction ∈ {higher_is_better, lower_is_better, neutral},
        period_type ∈ {day, week, month, quarter},
        thresholds JSONB {"green": n, "amber": n}, target,
        source_type ∈ {managed, external},
        data_source_id → data_sources ON DELETE RESTRICT,
        source_schema, source_table, date_column, value_column, narrative_column,
        aggregation ∈ {sum, avg, min, max, count, last}, created_at, updated_at)
   CHECK external ⇒ data_source_id, source_table, date_column, value_column NOT NULL

metric_values(id, metric_id → metrics ON DELETE CASCADE, period_start, period_end,
              value NUMERIC, narrative TEXT, created_at, updated_at)
   UNIQUE (metric_id, period_start), CHECK period_end ≥ period_start, INDEX (metric_id, period_start)

boards(id, name, description, columns 1–6, position, default_range JSONB {"mode","periods"}, created_at, updated_at)

board_cards(id, board_id → boards ON DELETE CASCADE, metric_id → metrics ON DELETE CASCADE,
            display_title, display_type ∈ {sparkline, trend, area, progress}, position, width 1–4,
            colour_thresholds JSONB (overrides metrics.thresholds), configuration JSONB {"target","show_narrative"})
```

A metric is defined once and can be used by cards on any number of boards.
Presentation settings (title, chart type, width, thresholds override, target)
belong to the card, and data settings belong to the metric.

## The global reporting range

The **board owns the range**. Cards never have their own.

1. The range selector produces a selection in the units the user chose:
   `week 2026-W10 → 2026-W28`, `month 2026-03 → 2026-07`, `quarter`, or
   `custom` dates. The selection is stored in the URL (`?mode=&from=&to=`).
2. The selection is converted to a closed date interval (ISO-8601 weeks start
   on Monday, and all arithmetic is in UTC). Week 10–28 of 2026 becomes
   `2026-03-02 … 2026-07-12`.
3. One request, `GET /api/boards/{id}/data?from=&to=`, evaluates every card
   against the same interval.
4. **Membership rule:** an observation belongs to the range when the
   *midpoint* of its period falls inside it. This makes weekly and monthly
   metrics behave sensibly together. March (midpoint 16 March) is in
   W10–W28, July (midpoint 16 July) is not, and a week that straddles two
   months counts towards the month that holds most of its days.
5. For each card the backend returns the in-range points, the latest value,
   the first value, the change between first and last (absolute, and percent
   when the first value is not zero), the trend and sentiment (adjusted for
   direction), min/avg/max, and the status:

| status | rule (higher-is-better; lower-is-better mirrors with ≤) |
|---|---|
| good (green) | latest ≥ green |
| warn (amber) | latest ≥ amber |
| bad (red) | otherwise |
| nodata (grey) | no observation in range |
| neutral | no thresholds configured |

Missing periods are allowed. Charts connect across gaps, and a card with no
data in the range shows grey.

## External sources

An external metric maps `schema.table(date_column, value_column[, narrative_column])`
and an aggregation. At query time the backend:

- opens a session with `default_transaction_read_only=on`, a
  `statement_timeout` and `TimeZone=UTC`, and always rolls back;
- checks the schema, table and columns against `information_schema` (which
  lists only objects the source user may read), and checks the column types:
  date/timestamp for the date column, numeric for the value column unless the
  aggregation is `count`;
- builds the query with `psycopg.sql.Identifier` and bound parameters. No
  user-supplied SQL is executed;
- groups rows with `date_trunc(period_type, date_column)`, aggregates the
  values, and takes the newest non-empty narrative in each period.

## Security

- Passwords are hashed with Argon2id. The login is throttled per username and
  per client IP, and the timing is equalised for unknown users.
- Sessions use random 256-bit tokens. Only their SHA-256 is stored. The cookie
  is `HttpOnly; Secure; SameSite=Strict`, and sessions are revoked on logout,
  password reset and deactivation.
- CSRF: on top of the SameSite cookies, every state-changing `/api` call must
  send `X-Requested-With: open-metrics`.
- Data-source passwords are encrypted with Fernet, keyed by
  `SECRET_ENCRYPTION_KEY`, and never returned by the API.
- Containers run as non-root with read-only root filesystems, all capabilities
  dropped and the RuntimeDefault seccomp profile. NetworkPolicies restrict the
  database to open-metrics pods, and the backend to the frontend and the edge
  proxy.
- nginx sends a CSP, nosniff, frame and referrer headers.

## Screen design

```
┌ open·metrics  [▦ Business performance ▾]              ⚙ Administration  [▶ Present]  ☾  (A) ┐
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ REPORTING PERIOD · WEEK 10 – WEEK 28, 2026                                    [Edit board] │
│ Business performance                                                                       │
│ Weekly and monthly management indicators…                                                  │
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐   │
│ │ [Weekly|Monthly|Quarterly|Custom]  ‹ Week 10 ▾ 2026 ▾ → Week 28 ▾ 2026 ▾ ›  Quick ▾ │   │
│ └──────────────────────────────────────────────────────────────────────────────────────┘   │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                        │
│ │Customer sat. ●│ │Project deliv.●│ │Incidents    ●│ │Revenue growth●│   card = status tint │
│ │85.9% ↗+3.4pts│ │89%  ↗+2 pts  │ │15   ↘−11.8%  │ │12.8% ↗+0.8pts│   hover → narrative  │
│ │~~~~~~~~~~~~• │ │████████░ 94% │ │▂▅▃▁▂▃▅▇▅▆▅█ │ │  ▁▃▅▇▇▆ area │   click → detail     │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘                        │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Detail dialog**: KPI strip (latest, vs previous period, change over range,
  min·avg·max), a full-history chart with the selected range shaded and the
  threshold lines drawn, then tabs for the narrative timeline, the values in
  the range and all values.
- **Presentation** (`/present/:id`): the board title and period are shown
  large, and cards stretch to fill the screen. Keys: `F` full screen,
  `←`/`→` previous/next board, `Esc` exit. Controls fade after 2.5 s, and the
  data refreshes every 5 minutes.
- **Administration**: Boards (create, rename, duplicate, delete, reorder cards,
  edit cards with a live preview), Metrics (definition, display and
  thresholds, data source mapping with preview), Values (manual entry with
  narrative, CSV import with dry-run validation), Data sources (connection
  test), Users (roles, reset, deactivate).

## API overview

| Method & path | Role |
|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password` | any |
| `GET /api/boards`, `GET /api/boards/{id}`, `GET /api/boards/{id}/data?from&to`, `GET /api/metrics/{id}/series?from&to&card_id` | viewer |
| `POST/PUT/DELETE /api/boards…`, `POST /api/boards/{id}/duplicate`, `PUT /api/boards/{id}/cards/order`, `POST /api/boards/{id}/cards`, `PUT/DELETE /api/cards/{id}` | admin |
| `GET/POST/PUT/DELETE /api/metrics…`, `POST /api/metrics/preview` | admin |
| `GET/POST /api/metrics/{id}/values`, `PUT/DELETE /api/values/{id}`, `POST /api/metrics/{id}/values/import` | admin |
| `GET/POST/PUT/DELETE /api/datasources…`, `POST /api/datasources/test`, `GET /api/datasources/{id}/schemas\|tables\|columns` | admin |
| `GET/POST/PUT/DELETE /api/users…` | admin |

OpenAPI docs are served at `/api/docs`.
