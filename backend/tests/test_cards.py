from datetime import date

from app.models import Metric
from app.services.series import Point, status_for, summarize


def test_status_higher_is_better():
    t = {"green": 85, "amber": 80}
    assert status_for(90, "higher_is_better", t) == "good"
    assert status_for(82, "higher_is_better", t) == "warn"
    assert status_for(70, "higher_is_better", t) == "bad"
    assert status_for(None, "higher_is_better", t) == "nodata"
    assert status_for(70, "higher_is_better", None) == "neutral"


def test_status_lower_is_better():
    t = {"green": 10, "amber": 15}
    assert status_for(8, "lower_is_better", t) == "good"
    assert status_for(12, "lower_is_better", t) == "warn"
    assert status_for(20, "lower_is_better", t) == "bad"


def _p(day, v):
    d = date(2026, 3, day)
    return Point(d, d, "", v, f"n{day}")


def test_summary_change_first_to_last_skips_gaps():
    m = Metric(direction="lower_is_better", name="x")
    s = summarize([_p(1, None), _p(2, 20), _p(3, None), _p(4, 15)], m, {"green": 10, "amber": 16})
    assert s["latest"]["value"] == 15 and s["first"]["value"] == 20
    assert s["change_abs"] == -5 and s["change_pct"] == -25
    assert s["trend"] == "down" and s["sentiment"] == "positive"
    assert s["status"] == "warn"
    assert len(s["points"]) == 4


def test_summary_single_point_has_no_change():
    s = summarize([_p(1, 5)], Metric(direction="higher_is_better", name="x"), None)
    assert s["change_abs"] is None and s["trend"] is None and s["status"] == "neutral"
