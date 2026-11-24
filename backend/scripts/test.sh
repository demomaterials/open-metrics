#!/usr/bin/env bash
# Run the backend test suite against a throwaway PostgreSQL container.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=om-test-pg PORT="${TEST_PG_PORT:-55432}"
BOOT="$(cd ../deploy/helm/metrics-db/files && pwd)/bootstrap.sql"
if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" postgres:17-alpine >/dev/null
  trap 'docker rm -f "$NAME" >/dev/null' EXIT
  until docker exec "$NAME" pg_isready -U postgres -q; do sleep 1; done
  sleep 1
fi
docker exec -i "$NAME" psql -q -U postgres -v app_password=app-pass -v reader_password=reader-pass -f - < "$BOOT" >/dev/null
export TEST_PG_PORT="$PORT"
uv run --frozen pytest "$@" 2>/dev/null || uv run pytest "$@"
