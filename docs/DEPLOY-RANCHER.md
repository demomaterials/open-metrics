# Deploying on Kubernetes / Rancher

open-metrics ships as two Helm charts. Install them into the same namespace:

1. `deploy/helm/metrics-db` – PostgreSQL (StatefulSet + PersistentVolumeClaim).
   Skip it if you use a managed PostgreSQL.
2. `deploy/helm/metrics-app` – the application.

Neither chart templates a Secret. Create the Secrets first.

## 1. Images

```bash
REGISTRY=registry.example.com/ TAG=1.0.0 PUSH=1 deploy/scripts/build-images.sh
```

This builds `open-metrics-backend:<tag>` and `open-metrics-frontend:<tag>`. If
the registry is private, add a pull secret through `imagePullSecrets` in the
values.

## 2. Namespace and Secrets

```bash
kubectl create namespace metrics
kubectl -n metrics create secret generic metrics-db-credentials \
  --from-literal=POSTGRES_PASSWORD='…' \
  --from-literal=APP_DB_PASSWORD='…' \
  --from-literal=READER_DB_PASSWORD='…'
kubectl -n metrics create secret generic metrics-app-secrets \
  --from-literal=SECRET_ENCRYPTION_KEY="$(openssl rand -base64 48)" \
  --from-literal=ADMIN_PASSWORD='…'
kubectl -n metrics create secret tls metrics-tls --cert=fullchain.pem --key=privkey.pem
```

`deploy/scripts/bootstrap-secrets.sh` creates the first two Secrets with random
values, and only when they do not exist yet. In Rancher you can also create
them under **Storage → Secrets**. **Back up `SECRET_ENCRYPTION_KEY`.** It
encrypts the passwords of external data sources.

## 3. Install with Helm

```bash
helm upgrade --install metrics-db deploy/helm/metrics-db -n metrics \
  --set persistence.storageClass=longhorn --wait

helm upgrade --install metrics deploy/helm/metrics-app -n metrics \
  --set hostname=metrics.example.com \
  --set images.backend=registry.example.com/open-metrics-backend:1.0.0 \
  --set images.frontend=registry.example.com/open-metrics-frontend:1.0.0 \
  --set ingress.className=nginx \
  --wait
```

On every install and upgrade:

- `metrics-db` runs a post-install/upgrade Job that creates or updates the roles
  `metrics_app` and `metrics_reader`, the databases `metrics` and `sampledata`,
  and the sample warehouse tables. It is idempotent.
- `metrics-app` runs a **pre-install/upgrade Job** (`python -m app.cli init`):
  Alembic migrations, the first administrator, and the demo boards (only when
  no boards exist). The new pods roll out only after it succeeds.

### From the Rancher UI

1. **Apps → Repositories → Create**. Point it at this Git repository (branch
   `main`), or package the charts (`helm package deploy/helm/*`) and publish
   them to a Helm repository or OCI registry.
2. **Apps → Charts**. Install **metrics-db**, then **metrics-app**, into the
   namespace `metrics`. Edit the YAML values (`hostname`, `images.*`,
   `ingress.className`, storage class).
3. Look under **Workloads** for `metrics-backend`, `metrics-frontend` and
   `metrics-db`, and under **Service Discovery → Ingresses** for the Ingress.
4. To upgrade, use **Apps → Installed Apps → metrics → Upgrade** with new image
   tags. The migration Job runs automatically.

### Routing options

| values | Use when |
|---|---|
| `ingress.enabled=true` (default), `ingress.className` | ingress-nginx / Traefik / RKE2 default ingress |
| `ingress.enabled=false`, `httpRoute.enabled=true`, `httpRoute.parentRefs=[…]` | an existing Gateway API gateway |
| `ingress.enabled=false`, `httpRoute.enabled=true`, `gateway.create=true` | a dedicated Envoy Gateway (used on Rancher Desktop) |

`/api` goes to the backend and everything else to the frontend.

Set `networkPolicy.edgeNamespaces` to the namespace of your ingress
controller. The defaults are `ingress-nginx`, `cattle-system` and
`kube-system`. Otherwise the backend NetworkPolicy blocks `/api`.

## Rancher Desktop (local)

Prerequisites: Kubernetes enabled, Traefik disabled, `helm` and `kubectl` on
the PATH.

```bash
deploy/scripts/deploy-local.sh          # --skip-build, --no-smoke
```

The script:

1. installs Envoy Gateway (skipped if it is already present; it is shared with open-cap);
2. creates the Secrets;
3. issues a TLS certificate for `metrics.bupasec.com`, signed by **open-cap's
   local CA** (`../open-cap/deploy/scripts/local-ca`) when that CA exists.
   A browser that already trusts the open-cap CA trusts this host too;
4. builds the images, tagged with the git commit;
5. installs both charts with `values-local.yaml`;
6. runs `deploy/scripts/smoke-test.sh`.

Then resolve the host to the gateway IP (once):

```bash
kubectl -n envoy-gateway-system get svc metrics-gateway   # EXTERNAL-IP, e.g. 192.168.64.2
echo "192.168.64.2 metrics.bupasec.com" | sudo tee -a /etc/hosts
```

> Each chart-created Gateway gets its own LoadBalancer on ports 80 and 443. On
> a single-node Rancher Desktop, only one of them (open-cap's `cap-gateway` or
> `metrics-gateway`) can hold those ports. To run both, attach open-metrics to
> a shared Gateway with `gateway.create=false` and
> `httpRoute.parentRefs=[{name: <gateway>, namespace: <ns>, sectionName: https}]`,
> and add `metrics.bupasec.com` to that Gateway's listener and certificate.

Admin password:

```bash
kubectl -n metrics get secret metrics-app-secrets -o jsonpath='{.data.ADMIN_PASSWORD}' | base64 -d; echo
```

## Operations

- **Backups**: `kubectl -n metrics exec metrics-db-0 -- pg_dump -U postgres metrics > metrics.sql`,
  or use a backup operator or a managed PostgreSQL.
- **Scaling**: the backend is stateless (sessions live in PostgreSQL). The
  login brute-force throttle is per pod.
- **Rolling back**: `helm rollback metrics <rev>`. Migrations are forward-only.
  Restore the database if a migration has to be undone.
