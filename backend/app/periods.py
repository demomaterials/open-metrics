"""Reporting-period arithmetic.

A reporting range is a closed date interval [start, end]. An observation
belongs to a range when the *midpoint* of its period falls inside it, so a
monthly value for March is in "Week 10 – Week 28" (its midpoint, 16 March,
is), and a week straddling two months counts towards the month holding most
of its days. This is independent of the wall clock.
"""
from datetime import date, timedelta

PERIOD_TYPES = ("day", "week", "month", "quarter")


def iso_week_start(year: int, week: int) -> date:
    return date.fromisocalendar(year, week, 1)


def iso_weeks_in_year(year: int) -> int:
    return date(year, 12, 28).isocalendar().week


def month_end(d: date) -> date:
    nxt = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    return nxt - timedelta(days=1)


def period_bounds(d: date, period_type: str) -> tuple[date, date]:
    """The period of the given type that contains d."""
    if period_type == "day":
        return d, d
    if period_type == "week":
        start = d - timedelta(days=d.weekday())
        return start, start + timedelta(days=6)
    if period_type == "month":
        start = d.replace(day=1)
        return start, month_end(start)
    if period_type == "quarter":
        start = date(d.year, 3 * ((d.month - 1) // 3) + 1, 1)
        return start, month_end(date(start.year, start.month + 2, 1))
    raise ValueError(f"unknown period type {period_type!r}")


def midpoint(start: date, end: date) -> date:
    return start + timedelta(days=(end - start).days // 2)


def in_range(start: date, end: date, range_start: date, range_end: date) -> bool:
    return range_start <= midpoint(start, end) <= range_end


def period_label(start: date, end: date, period_type: str) -> str:
    if period_type == "week":
        iso = start.isocalendar()
        return f"W{iso.week} {iso.year}"
    if period_type == "month":
        return start.strftime("%b %Y")
    if period_type == "quarter":
        return f"Q{(start.month - 1) // 3 + 1} {start.year}"
    return start.isoformat()


def parse_period(text: str, period_type: str) -> tuple[date, date]:
    """Parse CSV period notations: 2026-03-02, 2026-W10, 2026-03, 2026-Q1."""
    t = text.strip().upper()
    if "-W" in t:
        y, w = t.split("-W")
        start = iso_week_start(int(y), int(w))
        return start, start + timedelta(days=6)
    if "-Q" in t:
        y, q = t.split("-Q")
        return period_bounds(date(int(y), 3 * (int(q) - 1) + 1, 1), "quarter")
    parts = t.split("-")
    if len(parts) == 2:
        return period_bounds(date(int(parts[0]), int(parts[1]), 1), "month")
    d = date.fromisoformat(t)
    return period_bounds(d, period_type)


def default_range(mode: str, periods: int, today: date | None = None) -> tuple[date, date]:
    """Last `periods` complete-or-current periods ending at today's period."""
    today = today or date.today()
    periods = max(1, periods)
    _, end = period_bounds(today, mode)
    start, _ = period_bounds(today, mode)
    for _ in range(periods - 1):
        start, _ = period_bounds(start - timedelta(days=1), mode)
    return start, end
