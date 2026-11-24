#!/usr/bin/env bash
# Rancher Desktop → https://metrics.bupasec.com
#   ./deploy-local.sh [--skip-build] [--no-smoke]
set -euo pipefail
cd "$(dirname "$0")/.."   # deploy/
NS="${NAMESPACE:-metrics}"
HOST="${HOST:-metrics.bupasec.com}"
SKIP_BUILD=0; SMOKE=1
for a in "$@"; do
  case "$a" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-smoke) SMOKE=0 ;;
    *) echo "unknown flag $a"; exit 2 ;;
  esac
done

echo "### 1/6 Envoy Gateway controller"
./setup/install-envoy-gateway.sh

echo "### 2/6 Secrets + TLS"
NAMESPACE="$NS" ./scripts/bootstrap-secrets.sh
kubectl -n "$NS" get secret metrics-tls >/dev/null 2>&1 || NAMESPACE="$NS" HOST="$HOST" ./scripts/make-cert.sh --apply

echo "### 3/6 Images"
if [[ $SKIP_BUILD == 0 ]]; then
  TAG="$(./scripts/build-images.sh | tail -1)"
else
  TAG="${TAG:-$(helm get values metrics -n "$NS" -o json 2>/dev/null | sed -n 's/.*open-metrics-backend:\([^"]*\)".*/\1/p')}"
fi
echo "image tag: $TAG"

echo "### 4/6 metrics-db"
helm upgrade --install metrics-db ./helm/metrics-db -n "$NS" -f ./helm/metrics-db/values-local.yaml \
  --wait=legacy --timeout 10m

echo "### 5/6 metrics-app"
helm upgrade --install metrics ./helm/metrics-app -n "$NS" -f ./helm/metrics-app/values-local.yaml \
  --set hostname="$HOST" \
  --set images.backend="open-metrics-backend:$TAG" --set images.frontend="open-metrics-frontend:$TAG" \
  --wait=legacy --timeout 10m

echo "### 6/6 Status"
kubectl -n "$NS" get pods,svc,gateway,httproute
[[ $SMOKE == 1 ]] && NAMESPACE="$NS" HOST="$HOST" ./scripts/smoke-test.sh
echo
echo "open-metrics: https://$HOST  (user: admin)"
echo "  password: kubectl -n $NS get secret metrics-app-secrets -o jsonpath='{.data.ADMIN_PASSWORD}' | base64 -d; echo"
