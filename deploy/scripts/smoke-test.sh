#!/usr/bin/env bash
# End-to-end checks through the gateway (TLS, routing, auth, board data).
set -euo pipefail
NS="${NAMESPACE:-metrics}"
HOST="${HOST:-metrics.bupasec.com}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CA="$HERE/local-ca/ca.crt"
IP="${GATEWAY_IP:-$(kubectl -n envoy-gateway-system get svc metrics-gateway -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)}"
IP="${IP:-127.0.0.1}"
PW="$(kubectl -n "$NS" get secret metrics-app-secrets -o jsonpath='{.data.ADMIN_PASSWORD}' | base64 -d)"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT
C=(curl -sS --max-time 20 --resolve "$HOST:443:$IP" --resolve "$HOST:80:$IP" -b "$JAR" -c "$JAR")
[[ -f "$CA" ]] && C+=(--cacert "$CA") || C+=(-k)
U="https://$HOST"
fail() { echo "FAIL: $*"; exit 1; }
ok() { echo "ok   $*"; }

for i in $(seq 1 30); do
  code=$("${C[@]}" -o /dev/null -w '%{http_code}' "$U/" || true)
  [[ "$code" == 200 ]] && break; sleep 2
done
[[ "$code" == 200 ]] || fail "GET / → $code"; ok "TLS + SPA (GET / 200, gateway $IP)"
code=$("${C[@]}" -o /dev/null -w '%{http_code}' "http://$HOST/")
[[ "$code" == 301 ]] || fail "http redirect → $code"; ok "HTTP → HTTPS redirect"
code=$("${C[@]}" -o /dev/null -w '%{http_code}' "$U/api/auth/me")
[[ "$code" == 401 ]] || fail "anonymous /api/auth/me → $code"; ok "API requires authentication"
code=$("${C[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$U/api/auth/login")
[[ "$code" == 403 ]] || fail "login without CSRF header → $code"; ok "CSRF header enforced"
"${C[@]}" -f -o /dev/null -H 'X-Requested-With: open-metrics' -H 'Content-Type: application/json' \
  --data "$(printf '{"username":"admin","password":"%s"}' "$PW")" "$U/api/auth/login" || fail "admin login"
ok "admin login"
boards=$("${C[@]}" -f "$U/api/boards")
bid=$(printf '%s' "$boards" | python3 -c 'import sys,json; b=json.load(sys.stdin); print(b[0]["id"] if b else "")')
[[ -n "$bid" ]] || fail "no boards"; ok "boards listed (first id $bid)"
"${C[@]}" -f "$U/api/boards/$bid/data?from=2026-03-02&to=2026-07-12" | python3 -c '
import sys, json
d = json.load(sys.stdin)
assert d["from"] == "2026-03-02" and d["to"] == "2026-07-12"
cards = d["cards"]; assert cards, "no cards"
bad = [c for c in cards if c.get("error")]
assert not bad, bad
statuses = sorted({c["status"] for c in cards})
print(f"ok   board data for Week 10-28 2026: {len(cards)} cards, statuses {statuses}")'
src=$("${C[@]}" -f "$U/api/datasources" | python3 -c 'import sys,json; print(next((s["id"] for s in json.load(sys.stdin) if s["name"]=="Sample warehouse"),""))')
if [[ -n "$src" ]]; then
  "${C[@]}" -f "$U/api/datasources/$src/schemas" | grep -q analytics || fail "sample warehouse schemas"
  ok "external source reachable (read-only)"
fi
"${C[@]}" -f -o /dev/null -X POST -H 'X-Requested-With: open-metrics' "$U/api/auth/logout"
ok "logout"
echo "smoke test passed"
