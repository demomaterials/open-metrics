#!/usr/bin/env bash
# Create the namespace and the Secrets the charts reference — only if absent,
# so re-running never rotates anything. No chart templates a Secret.
#
#   metrics-db-credentials  POSTGRES_PASSWORD, APP_DB_PASSWORD, READER_DB_PASSWORD
#   metrics-app-secrets     SECRET_ENCRYPTION_KEY, ADMIN_PASSWORD
#
# SECRET_ENCRYPTION_KEY encrypts external data-source passwords. Back it up:
# losing it means re-entering every data-source password.
set -euo pipefail
NAMESPACE="${NAMESPACE:-metrics}"
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
rand() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "${1:-32}"; }

ensure() {
  local name="$1"; shift
  if kubectl -n "$NAMESPACE" get secret "$name" >/dev/null 2>&1; then
    echo "secret/$name exists (kept)"
  else
    kubectl -n "$NAMESPACE" create secret generic "$name" "$@" >/dev/null
    echo "secret/$name created"
  fi
}

ensure metrics-db-credentials \
  --from-literal=POSTGRES_PASSWORD="$(rand 32)" \
  --from-literal=APP_DB_PASSWORD="$(rand 32)" \
  --from-literal=READER_DB_PASSWORD="$(rand 32)"

ensure metrics-app-secrets \
  --from-literal=SECRET_ENCRYPTION_KEY="$(rand 64)" \
  --from-literal=ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(rand 20)}"
