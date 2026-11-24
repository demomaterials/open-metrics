#!/usr/bin/env bash
# Build both images into the local Docker daemon (Rancher Desktop's k3s uses
# the same daemon, so no push is needed). Prints the tag on the last line.
#   ./build-images.sh                       TAG defaults to the git commit
#   REGISTRY=registry.example.com/ PUSH=1 ./build-images.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TAG="${TAG:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo dev)$(git -C "$ROOT" diff --quiet 2>/dev/null || echo "-dirty")}"
REGISTRY="${REGISTRY:-}"
for c in backend frontend; do
  echo "==> ${REGISTRY}open-metrics-$c:$TAG" >&2
  docker build -q -t "${REGISTRY}open-metrics-$c:$TAG" "$ROOT/$c" >&2
  [[ "${PUSH:-0}" == 1 ]] && docker push "${REGISTRY}open-metrics-$c:$TAG" >&2
done
echo "$TAG"
