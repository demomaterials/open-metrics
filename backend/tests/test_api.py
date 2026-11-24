"""End-to-end API flows against a real PostgreSQL (see scripts/test.sh)."""
import os

W10_W28 = {"from": "2026-03-02", "to": "2026-07-12"}


def test_health(client):
    assert client.get("/healthz").json() == {"status": "ok"}
    assert client.get("/readyz").status_code == 200


def test_auth_required_and_csrf_header(client):
    assert client.get("/api/boards").status_code == 401
    r = client.post("/api/auth/login", json={"username": "admin", "password": "x"}, headers={"X-Requested-With": ""})
    assert r.status_code == 403
    assert client.post("/api/auth/login", json={"username": "admin", "password": "wrong-pass"}).status_code == 401


def test_login_me_logout(admin):
    me = admin.get("/api/auth/me").json()
    assert me["username"] == "admin" and me["role"] == "admin"
    assert admin.post("/api/auth/logout").status_code == 204
    assert admin.get("/api/auth/me").status_code == 401


def test_viewer_cannot_administer(admin):
    r = admin.post("/api/users", json={"username": "viewer1", "password": "viewer-password", "role": "viewer"})
    assert r.status_code == 201
    admin.post("/api/auth/logout")
    assert admin.post("/api/auth/login", json={"username": "viewer1", "password": "viewer-password"}).status_code == 200
    assert admin.get("/api/boards").status_code == 200
    assert admin.get("/api/metrics").status_code == 403
    assert admin.post("/api/boards", json={"name": "nope"}).status_code == 403
    assert admin.get("/api/datasources").status_code == 403


def test_demo_board_seeded_and_global_range(admin):
    boards = admin.get("/api/boards").json()
    demo = next(b for b in boards if b["name"] == "Business performance")
    assert demo["card_count"] >= 6
    data = admin.get(f"/api/boards/{demo['id']}/data", params=W10_W28).json()
    assert data["from"] == "2026-03-02" and data["to"] == "2026-07-12"
    weekly = [c for c in data["cards"] if c["points"] and "W" in c["points"][0]["label"]]
    assert weekly, "weekly cards present"
    for c in weekly:
        labels = [p["label"] for p in c["points"]]
        assert labels[0] in ("W10 2026", "W11 2026") and labels[-1] in ("W28 2026", "W27 2026")
        assert c["latest"]["narrative"]
        assert c["status"] in ("good", "warn", "bad")
    monthly = [c for c in data["cards"] if c["points"] and "W" not in c["points"][0]["label"]]
    for c in monthly:  # midpoint rule: Mar..Jun for W10–W28
        assert [p["label"] for p in c["points"]] == ["Mar 2026", "Apr 2026", "May 2026", "Jun 2026"]
    # Monthly range
    data = admin.get(f"/api/boards/{demo['id']}/data", params={"from": "2026-03-01", "to": "2026-07-31"}).json()
    for c in data["cards"]:
        if c["points"] and "W" not in c["points"][0]["label"]:
            assert len(c["points"]) == 5


def test_board_and_card_lifecycle(admin):
    b = admin.post("/api/boards", json={"name": "Finance", "columns": 2}).json()
    m = admin.post("/api/metrics", json={"name": "Cash days", "unit": "days", "direction": "lower_is_better",
                                         "thresholds": {"green": 30, "amber": 45}}).json()
    c1 = admin.post(f"/api/boards/{b['id']}/cards", json={"metric_id": m["id"]}).json()
    c2 = admin.post(f"/api/boards/{b['id']}/cards", json={"metric_id": m["id"], "display_type": "area",
                                                        "colour_thresholds": {"green": 20, "amber": 25}}).json()
    assert c1["display_type"] == "sparkline" and c2["colour_thresholds"]["green"] == 20
    r = admin.put(f"/api/boards/{b['id']}/cards/order", json={"card_ids": [c2["id"], c1["id"]]})
    assert [c["id"] for c in r.json()["cards"]] == [c2["id"], c1["id"]]
    admin.post(f"/api/metrics/{m['id']}/values", json={"period_start": "2026-03-04", "value": 28, "narrative": "ok"})
    data = admin.get(f"/api/boards/{b['id']}/data", params={"from": "2026-03-01", "to": "2026-03-31"}).json()
    by_id = {c["card_id"]: c for c in data["cards"]}
    assert by_id[c1["id"]]["status"] == "good"  # metric thresholds
    assert by_id[c2["id"]]["status"] == "bad"   # card override
    assert by_id[c1["id"]]["latest"]["period_start"] == "2026-03-02"  # snapped to ISO Monday
    dup = admin.post(f"/api/boards/{b['id']}/duplicate").json()
    assert dup["name"] == "Finance (copy)" and len(dup["cards"]) == 2
    assert admin.put(f"/api/boards/{dup['id']}", json={"name": "Finance 2"}).json()["name"] == "Finance 2"
    assert admin.delete(f"/api/boards/{dup['id']}").status_code == 204


def test_csv_import(admin):
    m = admin.post("/api/metrics", json={"name": "Imported", "period_type": "month", "unit": "percent"}).json()
    csv = "period,value,narrative\n2026-01,10.5%,January note\n2026-02,\"1,200\",\nbad,3,\n"
    r = admin.post(f"/api/metrics/{m['id']}/values/import", json={"csv": csv, "dry_run": True}).json()
    assert r["inserted"] == 2 and r["errors"] == 1
    assert admin.post(f"/api/metrics/{m['id']}/values/import", json={"csv": csv, "dry_run": False}).status_code == 422
    ok = "period,value,narrative\n2026-01,10.5,January\n2026-02,11,February\n"
    assert admin.post(f"/api/metrics/{m['id']}/values/import", json={"csv": ok, "dry_run": False}).json()["applied"]
    again = admin.post(f"/api/metrics/{m['id']}/values/import", json={"csv": ok, "dry_run": True}).json()
    assert again["updated"] == 2
    vals = admin.get(f"/api/metrics/{m['id']}/values").json()
    assert [v["label"] for v in vals] == ["Feb 2026", "Jan 2026"]
    assert vals[1]["period_end"] == "2026-01-31"


def _source(admin):
    return next(s for s in admin.get("/api/datasources").json() if s["name"] == "Sample warehouse")


def test_external_source_flow(admin):
    port = int(os.environ["SAMPLE_SOURCE_PORT"])
    t = admin.post("/api/datasources/test", json={"name": "x", "host": "localhost", "port": port,
                                                  "database": "sampledata", "username": "metrics_reader",
                                                  "password": "reader-pass"}).json()
    assert t["ok"] and t["read_only"]
    bad = admin.post("/api/datasources/test", json={"name": "x", "host": "localhost", "port": port,
                                                    "database": "sampledata", "username": "metrics_reader",
                                                    "password": "nope"}).json()
    assert bad["ok"] is False
    ds = _source(admin)
    assert ds["has_password"] and "password" not in ds and "password_encrypted" not in ds
    assert "analytics" in admin.get(f"/api/datasources/{ds['id']}/schemas").json()
    tables = [t["name"] for t in admin.get(f"/api/datasources/{ds['id']}/tables", params={"schema": "analytics"}).json()]
    assert {"service_desk_daily", "regional_sales"} <= set(tables)
    cols = admin.get(f"/api/datasources/{ds['id']}/columns",
                     params={"schema": "analytics", "table": "regional_sales"}).json()
    assert {c["name"]: c["kind"] for c in cols}["revenue_gbp"] == "numeric"
    mapping = {"data_source_id": ds["id"], "source_schema": "analytics", "source_table": "regional_sales",
               "date_column": "month", "value_column": "revenue_gbp", "narrative_column": "notes",
               "aggregation": "sum", "period_type": "month"}
    prev = admin.post("/api/metrics/preview", json={**mapping, "limit": 6}).json()["points"]
    assert len(prev) == 6 and prev[0]["value"] > 500000
    assert prev[-1]["narrative"] == "Northern region continues to trail plan."
    m = admin.post("/api/metrics", json={"name": "Regional revenue", "unit": "currency", "unit_label": "£",
                                         "source_type": "external", **mapping}).json()
    assert m["source_type"] == "external" and m["data_source_name"] == "Sample warehouse"
    b = admin.post("/api/boards", json={"name": "Sales"}).json()
    admin.post(f"/api/boards/{b['id']}/cards", json={"metric_id": m["id"]})
    data = admin.get(f"/api/boards/{b['id']}/data", params={"from": "2026-03-01", "to": "2026-07-31"}).json()
    assert [p["label"] for p in data["cards"][0]["points"]] == ["Mar 2026", "Apr 2026", "May 2026", "Jun 2026",
                                                               "Jul 2026"]
    series = admin.get(f"/api/metrics/{m['id']}/series", params={"from": "2026-03-01", "to": "2026-07-31"}).json()
    assert len(series["history"]) >= 20 and series["previous"]["label"] == "Jun 2026"
    assert admin.delete(f"/api/datasources/{ds['id']}").status_code == 409


def test_external_mapping_rejects_bad_identifiers(admin):
    ds = _source(admin)
    base = {"data_source_id": ds["id"], "source_schema": "analytics", "source_table": "regional_sales",
            "date_column": "month", "value_column": "revenue_gbp", "period_type": "month"}
    for bad in ({"value_column": "region"}, {"value_column": "revenue_gbp; DROP TABLE x"},
                {"source_table": "pg_authid"}, {"date_column": "orders"}):
        r = admin.post("/api/metrics/preview", json={**base, **bad})
        assert r.status_code == 422, (bad, r.text)


def test_last_admin_protected(admin):
    me = admin.get("/api/auth/me").json()
    assert admin.put(f"/api/users/{me['id']}", json={"role": "viewer"}).status_code == 400
    assert admin.delete(f"/api/users/{me['id']}").status_code == 400
