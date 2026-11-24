from datetime import date

from app.periods import default_range, in_range, iso_week_start, iso_weeks_in_year, parse_period, period_bounds


def test_iso_weeks():
    assert iso_week_start(2026, 10) == date(2026, 3, 2)
    assert iso_week_start(2026, 1) == date(2025, 12, 29)
    assert iso_weeks_in_year(2026) == 53
    assert iso_weeks_in_year(2025) == 52


def test_period_bounds():
    assert period_bounds(date(2026, 3, 4), "week") == (date(2026, 3, 2), date(2026, 3, 8))
    assert period_bounds(date(2026, 2, 14), "month") == (date(2026, 2, 1), date(2026, 2, 28))
    assert period_bounds(date(2026, 11, 3), "quarter") == (date(2026, 10, 1), date(2026, 12, 31))


def test_midpoint_rule_mixes_weeks_and_months():
    w10 = iso_week_start(2026, 10)
    w28_end = period_bounds(iso_week_start(2026, 28), "week")[1]
    # March (midpoint 16 Mar) is in W10–W28; July (midpoint 16 Jul) is not (W28 ends 12 Jul).
    assert in_range(date(2026, 3, 1), date(2026, 3, 31), w10, w28_end)
    assert not in_range(date(2026, 7, 1), date(2026, 7, 31), w10, w28_end)
    # Week 9 (23 Feb – 1 Mar) belongs to February, not March.
    assert not in_range(date(2026, 2, 23), date(2026, 3, 1), date(2026, 3, 1), date(2026, 3, 31))


def test_parse_period_notations():
    assert parse_period("2026-W10", "week") == (date(2026, 3, 2), date(2026, 3, 8))
    assert parse_period("2026-03", "month") == (date(2026, 3, 1), date(2026, 3, 31))
    assert parse_period("2026-q2", "quarter") == (date(2026, 4, 1), date(2026, 6, 30))
    assert parse_period("2026-03-04", "week") == (date(2026, 3, 2), date(2026, 3, 8))


def test_default_range():
    assert default_range("week", 12, date(2026, 11, 24)) == (date(2026, 9, 7), date(2026, 11, 29))
    assert default_range("month", 3, date(2026, 11, 24)) == (date(2026, 9, 1), date(2026, 11, 30))
