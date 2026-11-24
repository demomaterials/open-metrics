"""Demonstration content: a board of 8 metrics with weekly/monthly history and
narratives, plus (optionally) an external metric from the sample warehouse."""
import logging
import math
import random
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .crypto import encrypt
from .models import Board, BoardCard, DataSource, Metric, MetricValue
from .periods import iso_week_start, month_end

log = logging.getLogger(__name__)

# name, unit, label, decimals, direction, period, thresholds, target, base, drift, noise, description, drivers
DEMO = [
    ("Customer satisfaction", "percent", "", 1, "higher_is_better", "week", (85, 80), 90, 81.0, 0.16, 1.1,
     "Share of surveyed customers rating their experience 4 or 5 out of 5.",
     ["faster first-response times", "the new self-service portal", "fewer repeat contacts",
      "billing queries in the northern region", "longer wait times on Mondays"]),
    ("Project delivery", "percent", "", 0, "higher_is_better", "week", (90, 80), 95, 84.0, 0.2, 2.2,
     "Projects delivering milestones on or before the committed date.",
     ["the finance migration landing early", "improved sprint planning", "supplier delays on the data platform",
      "resourcing gaps in the infrastructure team"]),
    ("Operational incidents", "number", "", 0, "lower_is_better", "week", (10, 15), None, 16.0, -0.12, 2.6,
     "Priority 1–3 incidents raised in the period.",
     ["a network change freeze", "the storage firmware upgrade", "a recurring batch job failure",
      "better change-review discipline"]),
    ("Average resolution time", "days", "", 1, "lower_is_better", "week", (2.0, 3.0), None, 3.4, -0.03, 0.25,
     "Mean days from ticket creation to resolution.",
     ["automated triage", "a backlog clean-up", "staff holidays", "complex supplier-dependent tickets"]),
    ("Net promoter score", "number", "", 0, "higher_is_better", "week", (40, 30), None, 31.0, 0.25, 2.5,
     "Promoters minus detractors from the weekly customer survey.",
     ["positive app-store reviews", "the loyalty campaign", "delivery issues in the south-east"]),
    ("Revenue growth", "percent", "", 1, "higher_is_better", "month", (10, 5), None, 8.5, 0.45, 0.9,
     "Year-on-year revenue growth for the month.",
     ["strong renewals in corporate accounts", "new product launches", "currency headwinds",
      "softer demand in the retail segment"]),
    ("Employee engagement", "percent", "", 0, "higher_is_better", "month", (75, 65), 80, 66.0, 0.8, 1.6,
     "Pulse-survey engagement index.",
     ["the hybrid-working policy", "leadership town-halls", "workload pressure in operations"]),
    ("Operating cost", "currency", "£", 1, "lower_is_better", "month", (4_200_000, 4_600_000), None,
     4_900_000, -50_000, 120_000,
     "Monthly operating cost across all business units.",
     ["the data-centre consolidation", "contractor reductions", "energy price increases"]),
]


def _narrative(rng: random.Random, name: str, unit: str, value: float, prev: float | None,
               direction: str, drivers: list[str], label: str) -> str:
    def fmt(v: float, signed: bool = False) -> str:
        if abs(v) >= 100_000 or (unit == "currency" and abs(prev or v) >= 100_000):
            return f"£{v / 1e6:{'+' if signed else ''}.2f}m"
        return f"{v:{'+' if signed else ''}.1f}"

    if prev is None:
        return f"Baseline for {label}: {name.lower()} recorded at {fmt(value)}."
    delta = value - prev
    better = (delta > 0) == (direction == "higher_is_better")
    if abs(delta) < 1e-9:
        mood = "held steady"
    else:
        mood = ("improved" if better else "deteriorated") if abs(delta) > abs(prev) * 0.02 else (
            "edged up" if delta > 0 else "edged down")
    d1, d2 = rng.sample(drivers, 2) if len(drivers) > 1 else (drivers[0], drivers[0])
    pts = " points" if unit == "percent" else ""
    sentences = [
        f"{name} {mood} in {label} ({fmt(delta, True)}{pts} on the prior period), mainly reflecting {d1}.",
        rng.choice([
            f"The team expects {d2} to remain a factor next period.",
            f"Further attention is needed on {d2}.",
            f"Early signs suggest {d2} is starting to have an effect.",
            f"{d2[0].upper() + d2[1:]} was discussed at the operational review; actions are in place.",
        ]),
    ]
    return " ".join(sentences)


def _series(period: str, today: date) -> list[tuple[date, date]]:
    out = []
    if period == "week":
        start = iso_week_start(today.year, 1)
        while start + timedelta(days=6) < today:
            out.append((start, start + timedelta(days=6)))
            start += timedelta(days=7)
    else:
        m = date(today.year - 1, 7, 1)
        while month_end(m) < today:
            out.append((m, month_end(m)))
            m = month_end(m) + timedelta(days=1)
    return out


def seed_demo(db: Session, today: date | None = None) -> bool:
    """Create the demo board once (only when no boards exist yet)."""
    if db.scalar(select(func.count()).select_from(Board)):
        return False
    today = today or date.today()
    rng = random.Random(20260310)
    board = Board(
        name="Business performance",
        description="Weekly and monthly management indicators for the executive review.",
        columns=4,
        position=0,
        default_range={"mode": "week", "periods": 12},
    )
    ops = Board(
        name="Operational performance",
        description="Service and delivery health for the operations leadership team.",
        columns=3,
        position=1,
        default_range={"mode": "week", "periods": 8},
    )
    db.add_all([board, ops])
    metrics: dict[str, Metric] = {}
    for (name, unit, label, decimals, direction, period, (g, a), target, base, drift, noise,
         desc, drivers) in DEMO:
        m = Metric(name=name, description=desc, unit=unit, unit_label=label, decimals=decimals,
                   direction=direction, period_type=period, thresholds={"green": g, "amber": a},
                   target=target, source_type="managed")
        db.add(m)
        db.flush()
        metrics[name] = m
        prev = None
        for i, (ps, pe) in enumerate(_series(period, today)):
            # Smooth trend + seasonality + noise; a few deliberate gaps.
            v = base + drift * i + math.sin(i / 3.0) * noise * 0.8 + rng.gauss(0, noise * 0.5)
            if unit == "percent":
                v = min(v, 99.5)
            v = max(v, 0)
            v = round(v, decimals)
            if period == "week" and rng.random() < 0.04:
                continue  # missing reporting period
            db.add(MetricValue(metric_id=m.id, period_start=ps, period_end=pe, value=v,
                               narrative=_narrative(rng, name, unit, v, prev, direction, drivers,
                                                    _label(ps, period))))
            prev = v
    layout = [
        ("Customer satisfaction", "sparkline", 1), ("Project delivery", "progress", 1),
        ("Operational incidents", "trend", 1), ("Revenue growth", "area", 1),
        ("Net promoter score", "sparkline", 1), ("Average resolution time", "trend", 1),
        ("Employee engagement", "progress", 1), ("Operating cost", "area", 1),
    ]
    for i, (name, kind, width) in enumerate(layout):
        board.cards.append(BoardCard(metric_id=metrics[name].id, display_type=kind, position=i, width=width,
                                     configuration={"show_narrative": True}))
    for i, (name, kind) in enumerate([("Operational incidents", "area"), ("Average resolution time", "sparkline"),
                                      ("Project delivery", "progress"), ("Customer satisfaction", "trend")]):
        ops.cards.append(BoardCard(metric_id=metrics[name].id, display_type=kind, position=i, width=1,
                                   configuration={"show_narrative": True}))
    _sample_source(db, ops, position=len(ops.cards))
    db.commit()
    log.info("demo boards seeded")
    return True


def _label(ps: date, period: str) -> str:
    if period == "week":
        return f"week {ps.isocalendar().week}"
    return ps.strftime("%B %Y")


def _sample_source(db: Session, board: Board, position: int) -> None:
    """Register the bundled sample warehouse (deploy/helm/metrics-db) as an external source."""
    s = get_settings()
    if not (s.sample_source_host and s.sample_source_password):
        return
    ds = DataSource(name="Sample warehouse", kind="postgresql", host=s.sample_source_host,
                    port=s.sample_source_port, database=s.sample_source_database,
                    username=s.sample_source_user, password_encrypted=encrypt(s.sample_source_password),
                    sslmode="prefer", read_only=True)
    db.add(ds)
    db.flush()
    m = Metric(name="Service desk tickets resolved", unit="number", decimals=0,
               description="Tickets resolved per week, summed from analytics.service_desk_daily "
                           "in the sample warehouse (external source).",
               direction="higher_is_better", period_type="week", thresholds={"green": 900, "amber": 800},
               source_type="external", data_source_id=ds.id, source_schema="analytics",
               source_table="service_desk_daily", date_column="day", value_column="tickets_resolved",
               narrative_column="commentary", aggregation="sum")
    db.add(m)
    db.flush()
    board.cards.append(BoardCard(metric_id=m.id, display_type="area", position=position, width=2,
                                 configuration={"show_narrative": True}))
