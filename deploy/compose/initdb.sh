#!/bin/sh
# First-start hook of the postgres image: apply the shared bootstrap SQL.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -v app_password="$APP_DB_PASSWORD" -v reader_password="$READER_DB_PASSWORD" \
  -f /bootstrap/bootstrap.sql
