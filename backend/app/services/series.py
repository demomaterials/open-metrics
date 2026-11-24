"""Turning a metric (managed or external) into points, and points into card data."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Metric, MetricValue
from ..periods import in_range, period_bounds, period_label
from . import external


@dataclass
class Point:
    period_start: date
    period_end: date
    label: str
    value: float | None
    narrative: str

    def as_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["period_start"] = self.period_start.isoformat()
        d["period_end"] = self.period_end.isoformat()
        return d


def fetch_points(db: Session, metric: Metric, start: date | None = None, end: date | None = None) -> list[Point]:
    """All observations of the metric, or those whose period midpoint is in [start, end]."""
    if metric.source_type == "external":
        if metric.data_source is None:
            raise external.SourceError("Metric has no data source")
        rows = external.query_series(
            external.ConnParams.from_source(metric.data_source), external.Mapping.from_metric(metric), start, end
        )
        pts = []
        for ps, value, narrative in rows:
            ps, pe = period_bounds(ps, metric.period_type)
            pts.append(Point(ps, pe, period_label(ps, pe, metric.period_type), value, narrative))
    else:
        q = select(MetricValue).where(MetricValue.metric_id == metric.id).order_by(MetricValue.period_start)
        if start and end:
            # Coarse bound in SQL (index range scan), exact midpoint rule below.
            q = q.where(
                MetricValue.period_start <= end, MetricValue.period_end >= start - timedelta(days=1)
            )
        pts = [
            Point(
                v.period_start,
                v.period_end,
                period_label(v.period_start, v.period_end, metric.period_type),
                float(v.value) if v.value is not None else None,
                v.narrative or "",
            )
            for v in db.scalars(q)
        ]
    if start and end:
        pts = [p for p in pts if in_range(p.period_start, p.period_end, start, end)]
    return pts


def status_for(value: float | None, direction: str, thresholds: dict | None) -> str:
    """good | warn | bad | nodata | neutral.

    thresholds = {"green": g, "amber": a}. Higher-is-better: value >= g is good,
    value >= a is warn, otherwise bad. Lower-is-better mirrors it (<=).
    Without a green threshold the card is neutral.
    """
    if value is None:
        return "nodata"
    if not thresholds or thresholds.get("green") is None:
        return "neutral"
    green = float(thresholds["green"])
    amber = thresholds.get("amber")
    amber = float(amber) if amber is not None else None
    if direction == "lower_is_better":
        if value <= green:
            return "good"
        if amber is not None and value <= amber:
            return "warn"
        return "bad"
    if value >= green:
        return "good"
    if amber is not None and value >= amber:
        return "warn"
    return "bad"


def _trend(change: float | None, direction: str) -> tuple[str | None, str]:
    if change is None:
        return None, "neutral"
    if abs(change) < 1e-12:
        return "flat", "neutral"
    trend = "up" if change > 0 else "down"
    if direction == "neutral":
        return trend, "neutral"
    good = (change > 0) == (direction == "higher_is_better")
    return trend, "positive" if good else "negative"


def summarize(points: list[Point], metric: Metric, thresholds: dict | None) -> dict[str, Any]:
    vals = [p for p in points if p.value is not None]
    latest = vals[-1] if vals else None
    first = vals[0] if vals else None
    change_abs = change_pct = None
    if latest and first and latest is not first:
        change_abs = latest.value - first.value
        if first.value:
            change_pct = change_abs / abs(first.value) * 100
    trend, sentiment = _trend(change_abs, metric.direction)
    nums = [p.value for p in vals]
    return {
        "status": status_for(latest.value if latest else None, metric.direction, thresholds),
        "latest": latest.as_dict() if latest else None,
        "first": first.as_dict() if first else None,
        "change_abs": change_abs,
        "change_pct": change_pct,
        "trend": trend,
        "sentiment": sentiment,
        "count": len(vals),
        "min": min(nums) if nums else None,
        "max": max(nums) if nums else None,
        "avg": sum(nums) / len(nums) if nums else None,
        "points": [p.as_dict() for p in points],
    }


def previous_comparison(all_points: list[Point], latest_start: date | None) -> dict[str, Any] | None:
    """The observation immediately before the latest one, from full history."""
    if latest_start is None:
        return None
    prior = [p for p in all_points if p.value is not None and p.period_start < latest_start]
    if not prior:
        return None
    return prior[-1].as_dict()
