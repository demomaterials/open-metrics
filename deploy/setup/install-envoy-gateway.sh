#!/usr/bin/env bash
# Install the Envoy Gateway controller (Gateway API implementation), once per
# cluster. Shared with open-cap: if it is already installed this is a no-op.
# Rancher Desktop prerequisite: Traefik disabled (Preferences → Kubernetes).
set -euo pipefail
EG_VERSION="${EG_VERSION:-v1.9.3}"
if helm status eg -n envoy-gateway-system >/dev/null 2>&1; then
  echo "Envoy Gateway already installed"
else
  helm upgrade --install eg oci://docker.io/envoyproxy/gateway-helm --version "$EG_VERSION" \
    --namespace envoy-gateway-system --create-namespace --wait=legacy --timeout 5m
fi
kubectl wait -n envoy-gateway-system --for=condition=Available deployment/envoy-gateway --timeout=5m
