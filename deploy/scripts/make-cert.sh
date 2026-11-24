#!/usr/bin/env bash
# TLS certificate for the open-metrics host, signed by a local root CA.
#
# Reuses open-cap's local CA (../open-cap/deploy/scripts/local-ca) when present,
# so a browser that already trusts it needs no extra step; otherwise creates a
# new CA in deploy/scripts/local-ca. Output (gitignored, contains keys) goes to
# deploy/scripts/local-ca/.
#
#   ./make-cert.sh            # HOST=metrics.bupasec.com
#   ./make-cert.sh --apply    # also (re)create Secret metrics-tls in namespace metrics
set -euo pipefail
HOST="${HOST:-metrics.bupasec.com}"
NAMESPACE="${NAMESPACE:-metrics}"
SECRET_NAME="${SECRET_NAME:-metrics-tls}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/local-ca"
CA_DIR="${CA_DIR:-$HERE/../../../open-cap/deploy/scripts/local-ca}"
mkdir -p "$OUT"

if [[ -f "$CA_DIR/ca.key" && -f "$CA_DIR/ca.crt" ]]; then
  CA_DIR="$(cd "$CA_DIR" && pwd)"
  echo "using existing CA: $CA_DIR"
else
  CA_DIR="$OUT"
  if [[ ! -f "$CA_DIR/ca.key" ]]; then
    echo "creating root CA in $CA_DIR"
    openssl genrsa -out "$CA_DIR/ca.key" 4096 2>/dev/null
    openssl req -x509 -new -key "$CA_DIR/ca.key" -sha256 -days 3650 -out "$CA_DIR/ca.crt" \
      -subj "/O=open-metrics Local/CN=open-metrics Local Dev CA" \
      -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"
  fi
fi

cd "$OUT"
openssl genrsa -out server.key 2048 2>/dev/null
openssl req -new -key server.key -out server.csr -subj "/O=open-metrics/CN=${HOST}"
cat > server.ext <<EXT
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:${HOST}
EXT
# -CAserial in OUT so the shared CA directory is never written to.
openssl x509 -req -in server.csr -CA "$CA_DIR/ca.crt" -CAkey "$CA_DIR/ca.key" \
  -CAserial "$OUT/ca.srl" -CAcreateserial -out server.crt -days 825 -sha256 -extfile server.ext 2>/dev/null
cat server.crt "$CA_DIR/ca.crt" > server-chain.crt
cp "$CA_DIR/ca.crt" ca.crt 2>/dev/null || true
rm -f server.csr server.ext
echo "issued certificate for ${HOST}"

if [[ "${1:-}" == "--apply" ]]; then
  kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  kubectl -n "$NAMESPACE" create secret tls "$SECRET_NAME" --cert=server-chain.crt --key=server.key \
    --dry-run=client -o yaml | kubectl apply -f -
fi
