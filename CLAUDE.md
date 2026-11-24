# CLAUDE.md

open-metrics is a periodic metrics presentation platform: boards of metric
cards that share one reporting range per board, with narrative stored per
observation.

- **Backend** `backend/`: FastAPI + SQLAlchemy 2 + Alembic + psycopg 3, managed
  with uv. The schema is defined in `migrations/versions/`, so add a new
  revision for every model change. Range and status logic lives in
  `app/periods.py` (midpoint rule) and `app/services/series.py`.
- **External sources** `app/services/external.py`: identifiers are validated
  against information_schema and quoted with `sql.Identifier`. Never execute
  user SQL.
- **Frontend** `frontend/`: React 19 + TS + Tailwind 4 + Recharts. Range math
  lives in `src/lib/range.ts` (UTC, ISO weeks), and the range is kept in the
  URL.
- **Deploy**: `deploy/helm/metrics-db` and `deploy/helm/metrics-app`. No chart
  templates a Secret. Local: `deploy/scripts/deploy-local.sh`, which targets
  Rancher Desktop, namespace `metrics`, host `metrics.bupasec.com`, and uses
  Envoy Gateway and the open-cap local CA. Use Helm 4 with `--wait=legacy`.
- **Tests**: `cd backend && ./scripts/test.sh` (throwaway Postgres in Docker),
  `cd frontend && npm test`, and `deploy/scripts/smoke-test.sh` against a
  cluster.
- **Commits**: no Co-Authored-By trailers.
